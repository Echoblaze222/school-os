// src/lib/offlineOutbox.ts
//
// A tiny on-device queue for small, SAFE-TO-REPEAT actions the person took while
// offline, so they are sent when the connection comes back instead of being
// rolled back and lost.
//
// Only idempotent actions belong here (running one twice leaves the same
// result). Today that is "mark notification(s) read". Anything that creates
// something new (a chat message, a payment, attendance) needs its own
// duplicate-protection first and is deliberately NOT queued here.
//
// Privacy rules, same shape as src/lib/savedView/store.ts:
//  - Every entry is stamped with its user and only replayed for that user.
//  - Queuing as one user deletes every other user's entries first.
//  - clearOutbox() wipes everything; the sign-out flow calls it.
//  - Entries older than 7 days are dropped.
//  - Nothing here throws.

import type { SupabaseClient } from '@supabase/supabase-js'

const DB_NAME = 'schoolos-outbox'
const STORE   = 'ops'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type OutboxOp =
  | { kind: 'mark_read';     ids: string[] }
  | { kind: 'mark_all_read' }

interface OutboxRecord {
  seq?:      number
  userId:    string
  op:        OutboxOp
  queuedAt:  number
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'seq', autoIncrement: true })
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror   = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function wrap<T>(req: IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => resolve(undefined)
  })
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve) => {
    tx.oncomplete = () => resolve()
    tx.onerror    = () => resolve()
    tx.onabort    = () => resolve()
  })
}

/** True when a failed request looks like "no connection" rather than a server refusal. */
export function isNetworkFailure(error: { message?: string } | null | undefined): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = error?.message ?? ''
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)
}

/** Queue an action for later. Returns false if it could not be stored. */
export async function enqueue(userId: string, op: OutboxOp): Promise<boolean> {
  try {
    const db = await openDb()
    if (!db) return false
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const all   = (await wrap(store.getAll())) as OutboxRecord[] | undefined
    for (const rec of all ?? []) {
      if (rec.userId !== userId && rec.seq !== undefined) store.delete(rec.seq)
    }
    store.add({ userId, op, queuedAt: Date.now() } as OutboxRecord)
    await done(tx)
    db.close()
    return true
  } catch {
    return false
  }
}

async function readAll(userId: string): Promise<OutboxRecord[]> {
  const db = await openDb()
  if (!db) return []
  const all = (await wrap(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as OutboxRecord[] | undefined
  db.close()
  const cutoff = Date.now() - MAX_AGE_MS
  return (all ?? [])
    .filter((r) => r.userId === userId && r.queuedAt >= cutoff)
    .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

async function remove(seq: number): Promise<void> {
  const db = await openDb()
  if (!db) return
  const tx = db.transaction(STORE, 'readwrite')
  tx.objectStore(STORE).delete(seq)
  await done(tx)
  db.close()
}

/** Whether this user has anything waiting to be sent. */
export async function hasPending(userId: string): Promise<boolean> {
  try {
    return (await readAll(userId)).length > 0
  } catch {
    return false
  }
}

let flushing = false

/**
 * Send everything queued for this user, oldest first. An entry is removed only
 * after the server accepts it; the first network failure stops the run and
 * leaves the rest for next time. Returns how many were sent.
 */
export async function flushOutbox(supabase: SupabaseClient, userId: string): Promise<number> {
  if (flushing) return 0
  flushing = true
  let sent = 0
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
    for (const rec of await readAll(userId)) {
      const { op } = rec
      let error: { message?: string } | null = null

      if (op.kind === 'mark_read') {
        if (op.ids.length) {
          const res = await supabase
            .from('notifications')
            .update({ is_read: true })
            .in('id', op.ids)
            .eq('user_id', userId)
          error = res.error
        }
      } else if (op.kind === 'mark_all_read') {
        const res = await supabase
          .from('notifications')
          .update({ is_read: true })
          .eq('user_id', userId)
          .eq('is_read', false)
        error = res.error
      }

      if (error) {
        if (isNetworkFailure(error)) break // try again later, keep the rest in order
        // A real refusal (e.g. the row no longer exists) will never succeed: drop it.
      }
      if (rec.seq !== undefined) await remove(rec.seq)
      if (!error) sent++
    }
  } catch {
    // Offline sending is a bonus, never a requirement.
  } finally {
    flushing = false
  }
  return sent
}

/** Delete every queued action on this device. Called on sign-out. */
export async function clearOutbox(): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    await done(tx)
    db.close()
  } catch {
    // Sign-out must carry on regardless.
  }
}
