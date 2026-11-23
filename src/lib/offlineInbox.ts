// src/lib/offlineInbox.ts
//
// A small on-device copy of the push notifications this phone has received, so
// the notification bell can still show them when there is no network.
//
// Who writes: public/sw.js, the moment a push arrives (even when the app is
// closed). It uses the same database and store names as below - keep the two
// in step (DB_NAME, STORE, MAX_ITEMS, MAX_AGE_MS).
// Who reads: the notification bell, only when the live list can't be loaded.
//
// Privacy rules (same spirit as src/lib/savedView/store.ts):
//  - Every record is stamped with the user it was sent to, and only handed back
//    to that same user.
//  - When a push for one user is saved, every other user's records are deleted
//    first, so a shared phone never holds two people's notifications.
//  - clearInbox() wipes everything; the sign-out flow calls it.
//  - Records expire after 7 days and at most 50 are kept.
//  - Nothing here throws: if IndexedDB is missing or blocked, every function
//    quietly does nothing.

const DB_NAME = 'schoolos-inbox'
const STORE   = 'items'

export const MAX_ITEMS  = 50
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface InboxItem {
  /** The push tag - unique per push. */
  id:         string
  userId:     string
  title:      string
  body:       string
  url:        string
  receivedAt: number
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'id' })
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

/** This user's saved notifications, newest first. Empty if none, expired or someone else's. */
export async function loadInbox(userId: string): Promise<InboxItem[]> {
  try {
    const db = await openDb()
    if (!db) return []
    const all = (await wrap(db.transaction(STORE, 'readonly').objectStore(STORE).getAll())) as InboxItem[] | undefined
    db.close()
    const cutoff = Date.now() - MAX_AGE_MS
    return (all ?? [])
      .filter((i) => i.userId === userId && i.receivedAt >= cutoff)
      .sort((a, b) => b.receivedAt - a.receivedAt)
      .slice(0, MAX_ITEMS)
  } catch {
    return []
  }
}

/** Delete every saved notification on this device. Called on sign-out. */
export async function clearInbox(): Promise<void> {
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
