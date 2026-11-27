// src/lib/offline/db.ts
// CLIENT ONLY. The local database (IndexedDB via Dexie) behind SchoolOS offline
// mode. Tables:
//   outbox    - writes made while offline (or while the backend is down), waiting
//               to be replayed against Supabase in order.
//   unlock    - Android app only: a salted, slow hash of the user's password so the
//               lock screen can be opened with no connection (see unlockVerifier.ts).
//   rows      - read-side copy of the rows this user may see (see pullSync.ts).
//   syncState - per user and table: where the last pull got to.
//
// "Last thing the user saw" copies live in src/lib/savedView/store.ts, which has the
// privacy rules for a shared phone (one user at a time, expiry, wiped on sign-out).
// rows/syncState follow the same rules: one user at a time and cleared on sign-out.
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

export interface CachedRow {
  /** userId - rows are only ever read back for this user */
  u: string
  /** table name */
  t: string
  /** row id (uuid) */
  id: string
  /** generation; a full re-pull bumps it and then removes older generations */
  g: number
  data: Record<string, unknown>
}

export interface SyncStateRow {
  u: string
  /** table name, or '__tombstones__' */
  t: string
  /** server updated_at string of the last row received */
  cursorAt: string | null
  cursorId: string | null
  /** last sync_deletions.id applied (only used by the '__tombstones__' row) */
  tombId: number
  gen: number
  /** epoch ms of the last completed full pull */
  lastFullAt: number
  /** epoch ms of the last completed pull of any kind */
  lastSyncAt: number
  /** True while a full pull is unfinished, so an interrupted one RESUMES instead of restarting. */
  partial: boolean
  /** What this user was allowed to pull (role/classes). A change forces a full re-pull. */
  scopeKey: string
}

export type OfflineDB = Dexie & {
  outbox: Table<OutboxItem, number>
  unlock: Table<UnlockRecord, string>
  rows: Table<CachedRow, [string, string, string]>
  syncState: Table<SyncStateRow, [string, string]>
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
  db.version(3).stores({
    outbox: '++seq, &id, userId, [userId+status]',
    unlock: 'userId',
    rows: '[u+t+id], [u+t]',
    syncState: '[u+t]',
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
