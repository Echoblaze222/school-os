// src/lib/offline/db.ts
// CLIENT ONLY. The local database (IndexedDB via Dexie) behind SchoolOS offline
// mode. Tables:
//   outbox - writes made while offline (or while the backend is down), waiting
//            to be replayed against Supabase in order.
//   unlock - Android app only: a salted, slow hash of the user's password so the
//            lock screen can be opened with no connection (see unlockVerifier.ts).
//
// Reads are NOT stored here. "Last thing the user saw" copies already live in
// src/lib/savedView/store.ts, which has the privacy rules for a shared phone
// (one user at a time, expiry, wiped on sign-out). Offline reads reuse it
// instead of keeping a second, weaker cache.
//
// Opened lazily: importing this file on the server (SSR) must never touch
// IndexedDB, which does not exist there.

import Dexie, { type Table } from 'dexie'

export type OutboxStatus = 'pending' | 'failed'

export interface OutboxItem {
  /** Auto-increment primary key. Replay order = seq order. */
  seq?: number
  /** Client-generated UUID. Stable identity for the UI and for future idempotency keys. */
  id: string
  userId: string
  schoolId: string
  table: string
  op: 'upsert'
  rows: Record<string, unknown>[]
  onConflict: string
  /** Human text for the UI, e.g. "Attendance - JSS1A - 2026-11-22". */
  label: string
  status: OutboxStatus
  attempts: number
  /** Epoch ms; the item is not retried before this time. */
  nextAttemptAt: number
  createdAt: number
  lastError: string | null
}

export interface UnlockRecord {
  userId: string
  /** base64 random salt */
  salt: string
  /** base64 PBKDF2 output; never the password itself */
  hash: string
  iterations: number
  /** Persisted so restarting the app cannot reset the attempt limit. */
  failedAttempts: number
  createdAt: number
}

export type OfflineDB = Dexie & {
  outbox: Table<OutboxItem, number>
  unlock: Table<UnlockRecord, string>
}

export const DB_NAME = 'schoolos-offline'

let instance: OfflineDB | null = null

export function offlineStorageAvailable(): boolean {
  return typeof indexedDB !== 'undefined'
}

export function getDb(): OfflineDB {
  if (instance) return instance
  // Not a subclass on purpose: class fields can shadow Dexie's table
  // properties when useDefineForClassFields is on.
  const db = new Dexie(DB_NAME) as OfflineDB
  db.version(1).stores({
    // &id = unique; [userId+status] serves both "my pending items" and counts.
    outbox: '++seq, &id, userId, [userId+status]',
  })
  db.version(2).stores({
    outbox: '++seq, &id, userId, [userId+status]',
    unlock: 'userId',
  })
  instance = db
  return db
}

/** Test helper: drop the database and forget the open connection. */
export async function __resetOfflineDbForTests(): Promise<void> {
  if (instance) instance.close()
  instance = null
  await Dexie.delete(DB_NAME)
}
