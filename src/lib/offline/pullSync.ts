// src/lib/offline/pullSync.ts
// CLIENT ONLY. The read side of offline mode: copies the rows a user is allowed to
// see into the phone's local database (Dexie) and keeps them current by pulling only
// what changed since last time.
//
// Requires the migration sql/migrations/2026-11-25-offline-read-sync.sql
// (updated_at columns + public.sync_deletions tombstones).
//
// Design
//  - Cursor = the SERVER's (updated_at, id) of the last row received, never the
//    phone's clock. Ordering by (updated_at, id) makes paging stable when many rows
//    share a timestamp.
//  - Never parse updated_at into a Date: Postgres has microseconds, JS has
//    milliseconds. Keep it as the string the server sent.
//  - A full pull that is interrupted RESUMES from its cursor (state.partial) instead of
//    restarting, so a bad connection that keeps dropping still makes progress.
//  - A full re-pull happens when: never pulled, away longer than DELTA_TRUST_MS (the
//    server prunes tombstones at 90 days), or the user's scope changed (role, classes).
//    Old rows are removed only AFTER the new pull finished (generation number), so a
//    bad connection mid-resync never leaves the phone empty.
//  - Deletes come from public.sync_deletions. A brand-new phone first records the
//    newest tombstone id (a baseline) and skips history it never had.
//  - Windowed tables (attendance) also drop local rows that fell out of the window.
//  - Every row is scrubbed (scrubRow) before storing, whatever the server returned.
//  - Bad network is not offline: every request has a timeout, and a failure just stops
//    the pull. Whatever is already stored keeps being served.
//  - One user per phone: another user's rows are deleted before this user's are stored.
//  - Single flight per user + one across tabs (Web Locks), like the outbox engine.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getDb, type CachedRow, type SyncStateRow } from './db'
import { classifyResult } from './classify'
import {
  SYNC_TABLES,
  isSyncable,
  scrubRow,
  type Scope,
  type ScopeContext,
  type SyncTableConfig,
} from './syncTables'

export const PAGE_SIZE = 500
const REQUEST_TIMEOUT_MS = 8000
const TOMBSTONE_PAGE = 1000
const DAY_MS = 24 * 60 * 60 * 1000
/** Server prunes tombstones at 90 days; refuse to trust deltas a bit before that. */
export const DELTA_TRUST_MS = 80 * DAY_MS
/** Offline reads older than this are flagged stale in the UI (still returned). */
export const STALE_AFTER_MS = 7 * DAY_MS

const TOMBSTONES = '__tombstones__'
const LOCK_NAME = 'schoolos-pull-sync'

// Postgres / PostgREST codes meaning "the migration has not been applied".
const SCHEMA_MISSING = /^(42703|42P01|PGRST204|PGRST205)$/

export type StopReason = 'done' | 'network' | 'auth' | 'error' | 'schema'

export interface PullTableResult {
  table: string
  upserted: number
  stopped: StopReason
}

export interface PullAllResult {
  tables: PullTableResult[]
  deleted: number
  stopped: StopReason | 'busy'
}

export interface PullOptions {
  /** The signed-in user's role (from the saved identity). Unknown = safest, self-only scopes. */
  role?: string | null
  /** Test hook: rows per request. */
  pageSize?: number
  now?: number
}

interface QueryResult<T> {
  data: T | null
  error: { code?: string; message: string } | null
  status?: number
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) return AbortSignal.timeout(ms)
  const c = new AbortController()
  setTimeout(() => c.abort(), ms)
  return c.signal
}

function stopFrom(err: { code?: string; message: string } | null, status?: number): StopReason {
  if (err?.code && SCHEMA_MISSING.test(err.code)) return 'schema'
  const outcome = classifyResult({ error: err, status })
  if (outcome === 'network') return 'network'
  if (outcome === 'auth') return 'auth'
  return 'error'
}

function thrownToStop(e: unknown): StopReason {
  return stopFrom({ message: e instanceof Error ? e.message : String(e) })
}

function windowStart(cfg: SyncTableConfig, now: number): string | null {
  if (!cfg.window) return null
  return new Date(now - cfg.window.days * DAY_MS).toISOString().slice(0, 10)
}

function scopeKeyOf(scope: Scope): string {
  switch (scope.kind) {
    case 'all':
      return 'all'
    case 'none':
      return 'none'
    case 'eq':
      return `eq:${scope.column}:${scope.value}`
    case 'in':
      return `in:${scope.column}:${[...scope.values].sort().join(',')}`
  }
}

async function loadState(userId: string, table: string): Promise<SyncStateRow | undefined> {
  return getDb().syncState.get([userId, table])
}

async function teacherClassIds(userId: string): Promise<string[]> {
  const rows = await getDb().rows.where('[u+t]').equals([userId, 'class_teachers']).toArray()
  const ids = new Set<string>()
  for (const r of rows) {
    if (r.data.teacher_id === userId && r.data.class_id) ids.add(String(r.data.class_id))
  }
  return [...ids]
}

async function resolveScope(cfg: SyncTableConfig, userId: string, role?: string | null): Promise<Scope> {
  if (!cfg.scope) return { kind: 'all' }
  const classIds = await teacherClassIds(userId)
  return cfg.scope({ userId, role, classIds } satisfies ScopeContext)
}

/** Pull one table. Safe to call repeatedly; resumes from its stored cursor. */
export async function pullTable(
  client: SupabaseClient,
  userId: string,
  cfg: SyncTableConfig,
  opts: PullOptions = {},
): Promise<PullTableResult> {
  if (!isSyncable(cfg.table)) return { table: cfg.table, upserted: 0, stopped: 'error' }
  const db = getDb()
  const now = opts.now ?? Date.now()
  const pageSize = opts.pageSize ?? PAGE_SIZE

  const scope = await resolveScope(cfg, userId, opts.role)
  if (scope.kind === 'none') return { table: cfg.table, upserted: 0, stopped: 'done' }
  const scopeKey = scopeKeyOf(scope)

  const state = await loadState(userId, cfg.table)

  // What kind of pull is this, and where does it start?
  let full: boolean
  let gen: number
  let cursorAt: string | null = null
  let cursorId: string | null = null
  if (!state) {
    full = true
    gen = 1
  } else if (state.partial && state.scopeKey === scopeKey) {
    full = true // resume an interrupted full pull
    gen = state.gen
    cursorAt = state.cursorAt
    cursorId = state.cursorId
  } else if (state.partial || state.scopeKey !== scopeKey || now - state.lastFullAt > DELTA_TRUST_MS) {
    full = true // restart: scope changed, or too long away to trust deltas
    gen = state.gen + 1
  } else {
    full = false
    gen = state.gen
    cursorAt = state.cursorAt
    cursorId = state.cursorId
  }

  const since = windowStart(cfg, now)
  const columns = cfg.columns ? cfg.columns.join(',') : '*'
  let upserted = 0

  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = client
      .from(cfg.table)
      .select(columns)
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(pageSize)
      .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS))
    if (cursorAt && cursorId) {
      q = q.or(`updated_at.gt."${cursorAt}",and(updated_at.eq."${cursorAt}",id.gt.${cursorId})`)
    }
    if (since && cfg.window) q = q.gte(cfg.window.column, since)
    if (scope.kind === 'eq') q = q.eq(scope.column, scope.value)
    if (scope.kind === 'in') q = q.in(scope.column, scope.values)

    let res: QueryResult<Record<string, unknown>[]>
    try {
      res = await q
    } catch (e) {
      return { table: cfg.table, upserted, stopped: thrownToStop(e) }
    }
    if (res.error) return { table: cfg.table, upserted, stopped: stopFrom(res.error, res.status) }

    const rows = res.data ?? []
    if (rows.length === 0) break

    const last = rows[rows.length - 1]
    cursorAt = String(last.updated_at)
    cursorId = String(last.id)
    const cached: CachedRow[] = rows.map((r) => ({
      u: userId,
      t: cfg.table,
      id: String(r.id),
      g: gen,
      data: scrubRow(r),
    }))

    // Progress is saved with every page, so an interrupted pull resumes from here.
    await db.transaction('rw', db.rows, db.syncState, async () => {
      await db.rows.bulkPut(cached)
      await db.syncState.put({
        u: userId,
        t: cfg.table,
        cursorAt,
        cursorId,
        tombId: state?.tombId ?? 0,
        gen,
        lastFullAt: state?.lastFullAt ?? 0,
        lastSyncAt: state?.lastSyncAt ?? 0,
        partial: full,
        scopeKey,
      })
    })
    upserted += rows.length
    if (rows.length < pageSize) break
  }

  // Finished without error: commit.
  await db.transaction('rw', db.rows, db.syncState, async () => {
    if (full) {
      // Old generations are removed only now, after the new copy is complete.
      await db.rows.where('[u+t]').equals([userId, cfg.table]).filter((r) => r.g < gen).delete()
    }
    if (since && cfg.window) {
      const col = cfg.window.column
      await db.rows
        .where('[u+t]')
        .equals([userId, cfg.table])
        .filter((r) => typeof r.data[col] === 'string' && (r.data[col] as string).slice(0, 10) < since)
        .delete()
    }
    await db.syncState.put({
      u: userId,
      t: cfg.table,
      cursorAt,
      cursorId,
      tombId: state?.tombId ?? 0,
      gen,
      lastFullAt: full ? now : (state?.lastFullAt ?? now),
      lastSyncAt: now,
      partial: false,
      scopeKey,
    })
  })
  return { table: cfg.table, upserted, stopped: 'done' }
}

function tombstoneRow(prev: SyncStateRow | undefined, userId: string, tombId: number, now: number): SyncStateRow {
  return {
    u: userId,
    t: TOMBSTONES,
    cursorAt: null,
    cursorId: null,
    tombId,
    gen: 0,
    lastFullAt: prev?.lastFullAt ?? now,
    lastSyncAt: now,
    partial: false,
    scopeKey: '',
  }
}

/**
 * A new phone has no use for deletions that happened before it existed. Record the newest
 * tombstone id once, BEFORE the table pulls, so deletions that happen during the pull are
 * still applied afterwards.
 */
async function ensureTombstoneBaseline(
  client: SupabaseClient,
  userId: string,
  now: number,
): Promise<StopReason> {
  if (await loadState(userId, TOMBSTONES)) return 'done'
  let res: QueryResult<{ id: number }[]>
  try {
    res = await client
      .from('sync_deletions')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS))
  } catch (e) {
    return thrownToStop(e)
  }
  if (res.error) return stopFrom(res.error, res.status)
  await getDb().syncState.put(tombstoneRow(undefined, userId, res.data?.[0]?.id ?? 0, now))
  return 'done'
}

/** Apply server-side deletions to the local copy. */
async function applyTombstones(
  client: SupabaseClient,
  userId: string,
  now: number,
): Promise<{ deleted: number; stopped: StopReason }> {
  const db = getDb()
  const tables = SYNC_TABLES.map((c) => c.table)
  const prev = await loadState(userId, TOMBSTONES)
  let tombId = prev?.tombId ?? 0
  let deleted = 0

  for (;;) {
    let res: QueryResult<{ id: number; table_name: string; row_id: string }[]>
    try {
      res = await client
        .from('sync_deletions')
        .select('id,table_name,row_id')
        .in('table_name', tables)
        .gt('id', tombId)
        .order('id', { ascending: true })
        .limit(TOMBSTONE_PAGE)
        .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS))
    } catch (e) {
      return { deleted, stopped: thrownToStop(e) }
    }
    if (res.error) return { deleted, stopped: stopFrom(res.error, res.status) }
    const batch = res.data ?? []
    if (batch.length === 0) break

    tombId = batch[batch.length - 1].id
    await db.transaction('rw', db.rows, db.syncState, async () => {
      await db.rows.bulkDelete(batch.map((b) => [userId, b.table_name, b.row_id] as [string, string, string]))
      await db.syncState.put(tombstoneRow(prev, userId, tombId, now))
    })
    deleted += batch.length
    if (batch.length < TOMBSTONE_PAGE) break
  }
  return { deleted, stopped: 'done' }
}

/** Delete every other user's local rows (shared-phone rule). */
export async function purgeOtherUsers(userId: string): Promise<void> {
  const db = getDb()
  await db.rows.filter((r) => r.u !== userId).delete()
  await db.syncState.filter((s) => s.u !== userId).delete()
}

/** Called from sign-out: forget everything copied for reads. */
export async function clearReadCache(): Promise<void> {
  const db = getDb()
  await Promise.all([db.rows.clear(), db.syncState.clear()])
}

const inFlight = new Map<string, Promise<PullAllResult>>()

/**
 * Pull every synced table (in order), then apply deletions. Stops at the first network or
 * auth failure, and at the first "column does not exist" (migration not applied yet) so a
 * missing migration costs one failed request, not one per table.
 */
export function pullAll(client: SupabaseClient, userId: string, opts: PullOptions = {}): Promise<PullAllResult> {
  const existing = inFlight.get(userId)
  if (existing) return existing

  const run = (async (): Promise<PullAllResult> => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    const work = async (): Promise<PullAllResult> => {
      const now = opts.now ?? Date.now()
      await purgeOtherUsers(userId)

      const baseline = await ensureTombstoneBaseline(client, userId, now)
      if (baseline !== 'done') return { tables: [], deleted: 0, stopped: baseline }

      const tables: PullTableResult[] = []
      for (const cfg of SYNC_TABLES) {
        const r = await pullTable(client, userId, cfg, { ...opts, now })
        tables.push(r)
        if (r.stopped === 'network' || r.stopped === 'auth' || r.stopped === 'schema') {
          return { tables, deleted: 0, stopped: r.stopped }
        }
      }
      const t = await applyTombstones(client, userId, now)
      const failed = tables.find((x) => x.stopped === 'error')
      return { tables, deleted: t.deleted, stopped: failed ? 'error' : t.stopped }
    }
    if (!locks || typeof locks.request !== 'function') return work()
    const out = await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => (lock ? work() : null))
    return out ?? { tables: [], deleted: 0, stopped: 'busy' }
  })().finally(() => {
    if (inFlight.get(userId) === run) inFlight.delete(userId)
  })

  inFlight.set(userId, run)
  return run
}

// ---------------------------------------------------------------------------
// Reading from the local copy
// ---------------------------------------------------------------------------

export interface LocalRead<T> {
  rows: T[]
  /** When this table was last pulled successfully (epoch ms), or null if never. */
  syncedAt: number | null
  /** True when the copy is older than STALE_AFTER_MS: show "last updated ..." in the UI. */
  stale: boolean
}

export async function readLocal<T = Record<string, unknown>>(
  userId: string,
  table: string,
  filter?: (row: T) => boolean,
): Promise<LocalRead<T>> {
  const db = getDb()
  const [all, state] = await Promise.all([
    db.rows.where('[u+t]').equals([userId, table]).toArray(),
    loadState(userId, table),
  ])
  const rows = all.map((r) => r.data as unknown as T)
  const syncedAt = state?.lastSyncAt ? state.lastSyncAt : null
  return {
    rows: filter ? rows.filter(filter) : rows,
    syncedAt,
    stale: syncedAt === null || Date.now() - syncedAt > STALE_AFTER_MS,
  }
}

/**
 * Stale-while-revalidate for a screen: returns the local copy at once, and refreshes
 * that table in the background. `onFresh` is called with the new rows only if the
 * pull brought something new. Never throws and never blocks on the network.
 */
export async function readWithRefresh<T = Record<string, unknown>>(opts: {
  client: SupabaseClient
  userId: string
  table: string
  role?: string | null
  filter?: (row: T) => boolean
  onFresh?: (read: LocalRead<T>) => void
}): Promise<LocalRead<T>> {
  const { client, userId, table, role, filter, onFresh } = opts
  const local = await readLocal<T>(userId, table, filter)
  const cfg = SYNC_TABLES.find((c) => c.table === table)
  if (cfg) {
    void pullTable(client, userId, cfg, { role })
      .then(async (r) => {
        if (r.upserted > 0 && onFresh) onFresh(await readLocal<T>(userId, table, filter))
      })
      .catch(() => {})
  }
  return local
}

export interface SyncSummary {
  /** Oldest successful pull among the synced tables, or null if none finished yet. */
  lastSyncAt: number | null
  /** How many of the synced tables have finished at least one pull. */
  tablesReady: number
  tablesTotal: number
  rows: number
}

/** What is on this phone right now, for the sync status screen. */
export async function getSyncSummary(userId: string): Promise<SyncSummary> {
  const db = getDb()
  const states = await db.syncState
    .where('[u+t]')
    .between([userId, ''], [userId, '￿'])
    .toArray()
    .catch(() => [] as SyncStateRow[])
  const byTable = new Map(states.map((s) => [s.t, s]))
  const done = SYNC_TABLES.map((c) => byTable.get(c.table)).filter((s): s is SyncStateRow => !!s && s.lastSyncAt > 0)
  const rows = await db.rows.where('[u+t]').between([userId, ''], [userId, '￿']).count()
  return {
    lastSyncAt: done.length ? Math.min(...done.map((s) => s.lastSyncAt)) : null,
    tablesReady: done.length,
    tablesTotal: SYNC_TABLES.length,
    rows,
  }
}
