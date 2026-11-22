// src/lib/offline/db.ts
// CLIENT ONLY. The local database (IndexedDB via Dexie) behind SchoolOS offline
// mode. Two tables:
//   outbox - writes made while offline (or while the backend is down), waiting
//            to be replayed against Supabase in order.
//   cache  - last-known copies of data a user has already seen, so a screen can
//            render instantly and still work with no network.
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

export interface CacheEntry {
  /** `${userId}:${schoolId}:${name}` */
  key: string
  userId: string
  schoolId: string
  name: string
  value: unknown
  savedAt: number
}

export type OfflineDB = Dexie & {
  outbox: Table<OutboxItem, number>
  cache: Table<CacheEntry, string>
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
    cache: 'key, userId',
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
