// src/lib/offlineOutbox.ts
//
// A small on-device queue for things the person did while offline, so they are
// sent when the connection comes back instead of being rolled back and lost.
//
// What is queued, and why each is safe to send more than once:
//  - mark_read / mark_all_read: setting is_read=true twice is the same as once.
//  - chat_message (text only): the phone makes the message id itself. Sending
//    the same id again is rejected by the database (duplicate key), and that is
//    treated as "already sent". So a lost response + retry can never post twice.
//  - attendance: saved with an upsert on (student, date, class), so sending the
//    same register again leaves the same rows. Saving the same class and day
//    again replaces the older queued register (same `key`).
//
// NOT queued: files, photos and voice notes (they need their data kept on the
// phone first), payments, and anything that creates a new record without a key
// the server can use to spot a repeat.
//
// Outcomes when sending:
//  - no connection / session expired -> stop, keep everything, try again later
//  - the server refuses it (permission, bad data) -> mark_read is dropped (low
//    stakes); chat and attendance are kept and flagged "failed" so the person
//    sees it and can discard it. They are never lost silently.
//
// Privacy rules, same shape as src/lib/savedView/store.ts:
//  - Every entry is stamped with its user and only sent for that user.
//  - Queuing as one user deletes every other user's entries first.
//  - clearOutbox() wipes everything; the sign-out flow calls it.
//  - Entries older than 7 days are dropped.
//  - Nothing here throws.

import type { SupabaseClient } from '@supabase/supabase-js'

const DB_NAME    = 'schoolos-outbox'
const STORE      = 'ops'
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/** Fired on window whenever the queue changes, so the status pill can refresh. */
export const OUTBOX_EVENT = 'schoolos-outbox-changed'

export interface ChatNotify {
  userId:  string
  body:    string
  linkUrl: string
}

export type OutboxOp =
  | { kind: 'mark_read';     ids: string[] }
  | { kind: 'mark_all_read' }
  | {
      kind:    'chat_message'
      id:      string          // made on the phone; the message's real id
      roomId:  string
      content: string
      replyId: string | null
      notify:  ChatNotify | null
    }
  | {
      kind:      'attendance'
      classId:   string
      className: string
      date:      string
      rows:      Array<Record<string, unknown>>
    }

export interface OutboxRecord {
  seq?:          number
  userId:        string
  key?:          string   // a newer entry with the same key replaces this one
  op:            OutboxOp
  queuedAt:      number
  failedReason?: string   // set when the server refused it; kept so it isn't lost silently
}

/** The key that makes a newer saved register replace an older queued one. */
export function attendanceKey(classId: string, date: string): string {
  return `attendance:${classId}:${date}`
}

// ── IndexedDB plumbing ─────────────────────────────────────────────────────────────────────────

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

function announce() {
  try {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(OUTBOX_EVENT))
  } catch {
    // Cosmetic only.
  }
}

// ── Error classification ───────────────────────────────────────────────────────────────────────

/** True when a failed request looks like "no connection" rather than a server refusal. */
export function isNetworkFailure(error: { message?: string } | null | undefined): boolean {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const msg = error?.message ?? ''
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(msg)
}

/** The sign-in has expired: keep the queue and send after they log back in. */
function isAuthExpired(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === 'PGRST301' || /jwt expired|invalid jwt|not authenticated/i.test(error.message ?? '')
}

type Outcome =
  | { kind: 'done' }
  | { kind: 'later' }                    // no connection / expired session: stop, retry later
  | { kind: 'refused'; message: string } // the server said no

function classify(error: { message?: string; code?: string } | null | undefined): Outcome {
  if (!error) return { kind: 'done' }
  if (isNetworkFailure(error) || isAuthExpired(error)) return { kind: 'later' }
  return { kind: 'refused', message: error.message || 'The server refused this.' }
}

// ── Reading and writing the queue ──────────────────────────────────────────────────────────────

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

async function markFailed(seq: number, reason: string): Promise<void> {
  const db = await openDb()
  if (!db) return
  const tx    = db.transaction(STORE, 'readwrite')
  const store = tx.objectStore(STORE)
  const rec   = (await wrap(store.get(seq))) as OutboxRecord | undefined
  if (rec) store.put({ ...rec, failedReason: reason })
  await done(tx)
  db.close()
}

/**
 * Queue an action for later. A `key` makes this replace any earlier queued
 * entry with the same key. Returns false if it could not be stored.
 */
export async function enqueue(userId: string, op: OutboxOp, key?: string): Promise<boolean> {
  try {
    const db = await openDb()
    if (!db) return false
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const all   = (await wrap(store.getAll())) as OutboxRecord[] | undefined
    for (const rec of all ?? []) {
      if (rec.seq === undefined) continue
      const otherUser = rec.userId !== userId
      const replaced  = key !== undefined && rec.key === key
      if (otherUser || replaced) store.delete(rec.seq)
    }
    const record: OutboxRecord = { userId, op, queuedAt: Date.now(), ...(key !== undefined ? { key } : {}) }
    store.add(record)
    await done(tx)
    db.close()
    announce()
    return true
  } catch {
    return false
  }
}

/** Drop queued entries with this key, e.g. after the same register was saved online. */
export async function discardByKey(userId: string, key: string): Promise<void> {
  try {
    for (const rec of await readAll(userId)) {
      if (rec.key === key && rec.seq !== undefined) await remove(rec.seq)
    }
    announce()
  } catch {
    // Never block the caller.
  }
}

/** Drop a queued (or refused) chat message by its id, e.g. when the person retries it by hand. */
export async function discardChat(userId: string, messageId: string): Promise<void> {
  try {
    for (const rec of await readAll(userId)) {
      if (rec.op.kind === 'chat_message' && rec.op.id === messageId && rec.seq !== undefined) await remove(rec.seq)
    }
    announce()
  } catch {
    // Never block the caller.
  }
}

/** How many entries are waiting to be sent (not counting refused ones). */
export async function pendingCount(userId: string): Promise<number> {
  try {
    return (await readAll(userId)).filter((r) => !r.failedReason).length
  } catch {
    return 0
  }
}

/** Whether this user has anything waiting to be sent. */
export async function hasPending(userId: string): Promise<boolean> {
  return (await pendingCount(userId)) > 0
}

/** Entries the server refused. They stay until the person discards them. */
export async function listFailed(userId: string): Promise<OutboxRecord[]> {
  try {
    return (await readAll(userId)).filter((r) => !!r.failedReason)
  } catch {
    return []
  }
}

export async function discardFailed(userId: string): Promise<void> {
  try {
    for (const rec of await readAll(userId)) {
      if (rec.failedReason && rec.seq !== undefined) await remove(rec.seq)
    }
    announce()
  } catch {
    // Never block the caller.
  }
}

/** Everything on this device that has not been sent, waiting or refused. Used before sign-out. */
export async function countUnsent(): Promise<number> {
  try {
    const db = await openDb()
    if (!db) return 0
    const all = (await wrap(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as OutboxRecord[] | undefined
    db.close()
    const cutoff = Date.now() - MAX_AGE_MS
    return (all ?? []).filter((r) => r.queuedAt >= cutoff && r.op.kind !== 'mark_read' && r.op.kind !== 'mark_all_read').length
  } catch {
    return 0
  }
}

type ChatOp = Extract<OutboxOp, { kind: 'chat_message' }>

/** Messages still waiting to be sent in this room, oldest first, so the chat can show them. */
export async function listPendingChat(userId: string, roomId: string): Promise<Array<{ op: ChatOp; queuedAt: number }>> {
  try {
    const out: Array<{ op: ChatOp; queuedAt: number }> = []
    for (const r of await readAll(userId)) {
      if (!r.failedReason && r.op.kind === 'chat_message' && r.op.roomId === roomId) {
        out.push({ op: r.op, queuedAt: r.queuedAt })
      }
    }
    return out
  } catch {
    return []
  }
}

// ── Sending ─────────────────────────────────────────────────────────────────────────

async function sendChatMessage(supabase: SupabaseClient, userId: string, op: ChatOp): Promise<Outcome> {
  const insertData: Record<string, unknown> = {
    id:        op.id,
    room_id:   op.roomId,
    sender_id: userId,
    content:   op.content,
  }
  if (op.replyId) insertData.reply_to_id = op.replyId

  const { error } = await supabase.from('chat_messages').insert(insertData)

  if (error) {
    if (error.code === '23505') {
      // That id already exists. If it is our own message in this room, an
      // earlier try got through and only the reply was lost: it is sent.
      const { data: existing, error: lookupError } = await supabase
        .from('chat_messages')
        .select('id')
        .eq('id', op.id)
        .eq('sender_id', userId)
        .eq('room_id', op.roomId)
        .maybeSingle()
      if (existing) return { kind: 'done' }
      if (lookupError) return classify(lookupError)
      return { kind: 'refused', message: 'This message id is already in use.' }
    }
    return classify(error)
  }

  // Tell the other person, as sending online does. Never let it undo the send.
  if (op.notify) {
    try {
      await supabase.from('notifications').insert({
        user_id:  op.notify.userId,
        title:    'New message',
        body:     op.notify.body.length > 100 ? op.notify.body.slice(0, 100) + '…' : op.notify.body,
        type:     'chat',
        link_url: op.notify.linkUrl,
      })
    } catch {
      // Ignore.
    }
  }
  return { kind: 'done' }
}

async function sendAttendance(
  supabase: SupabaseClient,
  op: Extract<OutboxOp, { kind: 'attendance' }>,
): Promise<Outcome> {
  const { error } = await supabase
    .from('attendance')
    .upsert(op.rows, { onConflict: 'student_id,date,class_id' })
  return classify(error)
}

async function sendOp(supabase: SupabaseClient, userId: string, op: OutboxOp): Promise<Outcome> {
  switch (op.kind) {
    case 'mark_read': {
      if (!op.ids.length) return { kind: 'done' }
      const res = await supabase.from('notifications').update({ is_read: true }).in('id', op.ids).eq('user_id', userId)
      return classify(res.error)
    }
    case 'mark_all_read': {
      const res = await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false)
      return classify(res.error)
    }
    case 'chat_message': return sendChatMessage(supabase, userId, op)
    case 'attendance':   return sendAttendance(supabase, op)
  }
}

/** A refused "mark read" is not worth keeping; refused chat and attendance are. */
function dropsOnRefusal(op: OutboxOp): boolean {
  return op.kind === 'mark_read' || op.kind === 'mark_all_read'
}

let flushing = false

/**
 * Send everything queued for this user, oldest first. An entry is removed only
 * after the server accepts it; the first "no connection" stops the run and
 * leaves the rest, in order, for next time. Returns how many were sent.
 */
export async function flushOutbox(supabase: SupabaseClient, userId: string): Promise<number> {
  if (flushing) return 0
  flushing = true
  let sent = 0
  try {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
    for (const rec of await readAll(userId)) {
      if (rec.failedReason || rec.seq === undefined) continue

      let outcome: Outcome
      try {
        outcome = await sendOp(supabase, userId, rec.op)
      } catch (err) {
        // A thrown fetch error is a lost connection, not a refusal.
        outcome = classify({ message: err instanceof Error ? err.message : String(err) })
        if (outcome.kind === 'refused') outcome = { kind: 'later' }
      }

      if (outcome.kind === 'later') break

      if (outcome.kind === 'refused') {
        if (dropsOnRefusal(rec.op)) await remove(rec.seq)
        else await markFailed(rec.seq, outcome.message)
        continue
      }

      await remove(rec.seq)
      sent++
    }
  } catch {
    // Offline sending is a bonus, never a requirement.
  } finally {
    flushing = false
    announce()
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
    announce()
  } catch {
    // Sign-out must carry on regardless.
  }
}
