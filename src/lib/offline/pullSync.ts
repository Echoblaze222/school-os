// src/lib/offline/pullSync.ts
// CLIENT ONLY. The read side of offline mode: copies the rows a user is allowed to
// see into the phone's local database (Dexie) and keeps them current by pulling only
// what changed since last time.
//
// Requires the migration schoolos_sync_foundation (updated_at columns + sync_deletions).
//
// Design
//  - Cursor = the SERVER's (updated_at, id) of the last row received, never the
//    phone's clock. Ordering by (updated_at, id) makes paging stable when many rows
//    share a timestamp.
//  - Never parse updated_at into a Date: Postgres has microseconds, JS has
//    milliseconds. Keep it as the string the server sent.
//  - Deletes come from public.sync_deletions (tombstones), applied after the pull.
//  - If a device has been away longer than the tombstone retention, it cannot trust
//    deltas: it does a full re-pull. Old rows are only removed AFTER the new pull has
//    finished (generation number), so a bad connection mid-resync never leaves the
//    phone empty.
//  - Bad network is not offline: every request has a timeout, and a failure just stops
//    the pull. Whatever is already stored keeps being served.
//  - One user per phone: another user's rows are deleted before this user's are stored.
//  - Single flight per user + one across tabs (Web Locks), like the outbox engine.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getDb, type CachedRow, type SyncStateRow } from './db'
import { classifyResult } from './classify'
import { SYNC_TABLES, isSyncable, type SyncTableConfig } from './syncTables'

const PAGE_SIZE = 500
const REQUEST_TIMEOUT_MS = 8000
const DAY_MS = 24 * 60 * 60 * 1000
/** Server prunes tombstones at 90 days; refuse to trust deltas a bit before that. */
export const DELTA_TRUST_MS = 80 * DAY_MS
/** Offline reads older than this are flagged stale in the UI (still returned). */
export const STALE_AFTER_MS = 7 * DAY_MS

const TOMBSTONES = '__tombstones__'
const LOCK_NAME = 'schoolos-pull-sync'

export interface PullTableResult {
  table: string
  upserted: number
  stopped: 'done' | 'network' | 'auth' | 'error'
}

export interface PullAllResult {
  tables: PullTableResult[]
  deleted: number
  stopped: 'done' | 'network' | 'auth' | 'error' | 'busy'
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) return AbortSignal.timeout(ms)
  const c = new AbortController()
  setTimeout(() => c.abort(), ms)
  return c.signal
}

function stopFrom(err: { code?: string; message: string } | null): PullTableResult['stopped'] {
  const outcome = classifyResult({ error: err })
  if (outcome === 'network') return 'network'
  if (outcome === 'auth') return 'auth'
  return 'error'
}

function windowStart(cfg: SyncTableConfig, now: number): string | null {
  if (!cfg.window) return null
  return new Date(now - cfg.window.days * DAY_MS).toISOString().slice(0, 10)
}

async function loadState(userId: string, table: string): Promise<SyncStateRow | undefined> {
  return getDb().syncState.get([userId, table])
}

/** Pull one table. Safe to call repeatedly; resumes from its stored cursor. */
export async function pullTable(
  client: SupabaseClient,
  userId: string,
  cfg: SyncTableConfig,
  now: number = Date.now(),
): Promise<PullTableResult> {
  if (!isSyncable(cfg.table)) return { table: cfg.table, upserted: 0, stopped: 'error' }
  const db = getDb()

  const state = await loadState(userId, cfg.table)
  const needsFull = !state || now - state.lastFullAt > DELTA_TRUST_MS
  const gen = needsFull ? (state?.gen ?? 0) + 1 : (state as SyncStateRow).gen
  let cursorAt: string | null = needsFull ? null : (state as SyncStateRow).cursorAt
  let cursorId: string | null = needsFull ? null : (state as SyncStateRow).cursorId
  const since = windowStart(cfg, now)
  let upserted = 0

  for (;;) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = client
      .from(cfg.table)
      .select('*')
      .order('updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(PAGE_SIZE)
      .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS))
    if (cursorAt && cursorId) {
      q = q.or(`updated_at.gt."${cursorAt}",and(updated_at.eq."${cursorAt}",id.gt.${cursorId})`)
    }
    if (since && cfg.window) q = q.gte(cfg.window.column, since)

    let res: { data: Record<string, unknown>[] | null; error: { code?: string; message: string } | null }
    try {
      res = await q
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      return { table: cfg.table, upserted, stopped: stopFrom({ message }) }
    }
    if (res.error) return { table: cfg.table, upserted, stopped: stopFrom(res.error) }

    const rows = res.data ?? []
    if (rows.length === 0) break

    const last = rows[rows.length - 1]
    cursorAt = String(last.updated_at)
    cursorId = String(last.id)
    const cached: CachedRow[] = rows.map((r) => ({ u: userId, t: cfg.table, id: String(r.id), g: gen, data: r }))

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
      })
    })
    upserted += rows.length
    if (rows.length < PAGE_SIZE) break
  }

  // Finished without error: commit. On a full re-pull, drop rows from older generations.
  await db.transaction('rw', db.rows, db.syncState, async () => {
    if (needsFull) {
      await db.rows.where('[u+t]').equals([userId, cfg.table]).filter((r) => r.g < gen).delete()
    }
    await db.syncState.put({
      u: userId,
      t: cfg.table,
      cursorAt,
      cursorId,
      tombId: 0,
      gen,
      lastFullAt: needsFull ? now : (state?.lastFullAt ?? now),
      lastSyncAt: now,
    })
  })
  return { table: cfg.table, upserted, stopped: 'done' }
}

/** Apply server-side deletions to the local copy. */
async function applyTombstones(
  client: SupabaseClient,
  userId: string,
): Promise<{ deleted: number; stopped: PullTableResult['stopped'] }> {
  const db = getDb()
  const tables = SYNC_TABLES.map((c) => c.table)
  const prev = await loadState(userId, TOMBSTONES)
  let tombId = prev?.tombId ?? 0
  let deleted = 0

  for (;;) {
    let res: { data: { id: number; table_name: string; row_id: string }[] | null; error: { code?: string; message: string } | null }
    try {
      res = await client
        .from('sync_deletions')
        .select('id,table_name,row_id')
        .in('table_name', tables)
        .gt('id', tombId)
        .order('id', { ascending: true })
        .limit(1000)
        .abortSignal(timeoutSignal(REQUEST_TIMEOUT_MS))
    } catch (e) {
      return { deleted, stopped: stopFrom({ message: e instanceof Error ? e.message : String(e) }) }
    }
    if (res.error) return { deleted, stopped: stopFrom(res.error) }
    const batch = res.data ?? []
    if (batch.length === 0) break

    tombId = batch[batch.length - 1].id
    await db.transaction('rw', db.rows, db.syncState, async () => {
      await db.rows.bulkDelete(batch.map((b) => [userId, b.table_name, b.row_id] as [string, string, string]))
      await db.syncState.put({
        u: userId, t: TOMBSTONES, cursorAt: null, cursorId: null, tombId,
        gen: 0, lastFullAt: prev?.lastFullAt ?? Date.now(), lastSyncAt: Date.now(),
      })
    })
    deleted += batch.length
    if (batch.length < 1000) break
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

/** Pull every synced table (in order), then apply deletions. Stops at the first network/auth failure. */
export function pullAll(client: SupabaseClient, userId: string, now: number = Date.now()): Promise<PullAllResult> {
  const existing = inFlight.get(userId)
  if (existing) return existing

  const run = (async (): Promise<PullAllResult> => {
    const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
    const work = async (): Promise<PullAllResult> => {
      await purgeOtherUsers(userId)
      const tables: PullTableResult[] = []
      for (const cfg of SYNC_TABLES) {
        const r = await pullTable(client, userId, cfg, now)
        tables.push(r)
        if (r.stopped === 'network' || r.stopped === 'auth') return { tables, deleted: 0, stopped: r.stopped }
      }
      const t = await applyTombstones(client, userId)
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
  filter?: (row: T) => boolean
  onFresh?: (read: LocalRead<T>) => void
}): Promise<LocalRead<T>> {
  const { client, userId, table, filter, onFresh } = opts
  const local = await readLocal<T>(userId, table, filter)
  const cfg = SYNC_TABLES.find((c) => c.table === table)
  if (cfg) {
    void pullTable(client, userId, cfg)
      .then(async (r) => {
        if (r.upserted > 0 && onFresh) onFresh(await readLocal<T>(userId, table, filter))
      })
      .catch(() => {})
  }
  return local
}
