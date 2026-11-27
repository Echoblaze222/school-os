// src/lib/offline/syncEngine.ts
// CLIENT ONLY. Replays the outbox against Supabase.
//
// Guarantees
//  - In order (by seq), one item at a time, so "mark attendance" then "fix one
//    student" ends in the right state.
//  - Single flight: one flush per user at a time in this tab, and one across tabs
//    (Web Locks) so two open tabs never send the same item twice.
//  - A write the server REFUSES (RLS, constraint) is moved to 'failed' and the
//    queue moves on; it never blocks everyone behind it and is never silently
//    dropped.
//  - Being offline is not the item's fault: network/auth problems stop the flush
//    without touching the item's attempt counter.
//  - Only the signed-in user's items are ever sent.
//
// Conflict policy (Phase 1): last write wins. A queued upsert replayed later
// overwrites what is on the server for that natural key. Good for attendance;
// grades will need a compare-and-flag step before they are allowed offline.

import { getDb, type OutboxItem } from './db'
import { isOfflineWritable } from './outbox'
import { backoffMs, classifyResult, MAX_ATTEMPTS, type Outcome, type UpsertResult } from './classify'

/** The only part of the Supabase client the engine needs (easy to fake in tests). */
export interface SyncClient {
  from(table: string): {
    upsert(rows: Record<string, unknown>[], options: { onConflict: string }): PromiseLike<UpsertResult>
  }
}

export interface FlushOptions {
  now?: () => number
  random?: () => number
  maxAttempts?: number
}

export interface FlushResult {
  sent: number
  failed: number
  remaining: number
  stopped: 'done' | 'network' | 'auth' | 'backoff' | 'busy'
}

const LOCK_NAME = 'schoolos-outbox-flush'
const inFlight = new Map<string, Promise<FlushResult>>()

async function countPending(userId: string): Promise<number> {
  return getDb().outbox.where('[userId+status]').equals([userId, 'pending']).count()
}

async function withCrossTabLock(userId: string, fn: () => Promise<FlushResult>): Promise<FlushResult> {
  const locks = typeof navigator !== 'undefined' ? navigator.locks : undefined
  if (!locks || typeof locks.request !== 'function') return fn()
  const result = await locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
    if (!lock) return null // another tab is already flushing
    return fn()
  })
  return result ?? { sent: 0, failed: 0, remaining: await countPending(userId), stopped: 'busy' }
}

export function flushOutbox(client: SyncClient, userId: string, options: FlushOptions = {}): Promise<FlushResult> {
  const existing = inFlight.get(userId)
  if (existing) return existing
  const run = withCrossTabLock(userId, () => runFlush(client, userId, options)).finally(() => {
    if (inFlight.get(userId) === run) inFlight.delete(userId)
  })
  inFlight.set(userId, run)
  return run
}

async function sendItem(client: SyncClient, item: OutboxItem): Promise<{ outcome: Outcome; message: string }> {
  // Defence in depth: the allowlist is enforced at enqueue time, but the
  // outbox lives in a store the user can edit with browser dev tools.
  if (!isOfflineWritable(item.table, item.onConflict)) {
    return { outcome: 'fatal', message: `Table "${item.table}" is not allowed offline` }
  }
  try {
    const res = await client.from(item.table).upsert(item.rows, { onConflict: item.onConflict })
    return { outcome: classifyResult(res), message: res.error?.message ?? '' }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return { outcome: classifyResult({ error: { message } }), message }
  }
}

async function runFlush(client: SyncClient, userId: string, options: FlushOptions): Promise<FlushResult> {
  const db = getDb()
  const now = options.now ?? Date.now
  const random = options.random ?? Math.random
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS

  const items = await db.outbox.where('[userId+status]').equals([userId, 'pending']).sortBy('seq')
  let sent = 0
  let failed = 0
  let stopped: FlushResult['stopped'] = 'done'

  for (const item of items) {
    const seq = item.seq as number
    if (item.nextAttemptAt > now()) {
      stopped = 'backoff'
      break
    }

    const { outcome, message } = await sendItem(client, item)

    if (outcome === 'ok') {
      await db.outbox.delete(seq)
      sent++
      continue
    }
    if (outcome === 'network') {
      stopped = 'network'
      break
    }
    if (outcome === 'auth') {
      stopped = 'auth'
      break
    }
    if (outcome === 'server') {
      const attempts = item.attempts + 1
      if (attempts >= maxAttempts) {
        await db.outbox.update(seq, { status: 'failed', attempts, lastError: message })
        failed++
        continue
      }
      await db.outbox.update(seq, { attempts, lastError: message, nextAttemptAt: now() + backoffMs(attempts, random) })
      stopped = 'backoff'
      break
    }
    // fatal: the server refused it; retrying cannot help.
    await db.outbox.update(seq, { status: 'failed', attempts: item.attempts + 1, lastError: message })
    failed++
  }

  return { sent, failed, remaining: await countPending(userId), stopped }
}
