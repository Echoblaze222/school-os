// src/lib/savedView/store.ts
//
// A tiny on-device store for "the last thing this user saw" on a screen, so
// the screen can appear instantly on a slow connection while fresh data is
// still on its way. It lives in the phone's own IndexedDB and never leaves it.
//
// Privacy rules (the reason this file exists in this exact shape):
//  - Every record is stamped with the user it belongs to, and is only ever
//    handed back to that same user.
//  - Saving as one user deletes every other user's records first, so a
//    shared phone never holds two people's data at once.
//  - clearSavedViews() wipes everything; the sign-out flow calls it.
//  - Records expire after 24 hours.
//  - Nothing here throws: if IndexedDB is missing, blocked (private mode) or
//    broken, every function quietly does nothing and the app simply behaves
//    as it did before.

const DB_NAME = 'schoolos-saved-view'
const STORE   = 'views'

/** A saved copy older than this is ignored and treated as not saved. */
export const MAX_AGE_MS = 24 * 60 * 60 * 1000

interface SavedRecord {
  key:     string
  userId:  string
  savedAt: number
  data:    unknown
}

export interface SavedView<T> {
  data:    T
  savedAt: number
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null)
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'key' })
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

/** Save `data` for this user and screen, removing any other user's records. */
export async function saveView(userId: string, routeKey: string, data: unknown): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    const tx    = db.transaction(STORE, 'readwrite')
    const store = tx.objectStore(STORE)
    const all   = (await wrap(store.getAll())) as SavedRecord[] | undefined
    for (const rec of all ?? []) {
      if (rec.userId !== userId) store.delete(rec.key)
    }
    const record: SavedRecord = { key: routeKey, userId, savedAt: Date.now(), data }
    store.put(record)
    await done(tx)
    db.close()
  } catch {
    // Saving is a bonus, never a requirement.
  }
}

/** The saved copy for this user and screen, or null if none / expired / someone else's. */
export async function loadView<T>(userId: string, routeKey: string): Promise<SavedView<T> | null> {
  try {
    const db = await openDb()
    if (!db) return null
    const rec = (await wrap(db.transaction(STORE, 'readonly').objectStore(STORE).get(routeKey))) as SavedRecord | undefined
    db.close()
    if (!rec) return null
    if (rec.userId !== userId) return null
    if (Date.now() - rec.savedAt > MAX_AGE_MS) return null
    return { data: rec.data as T, savedAt: rec.savedAt }
  } catch {
    return null
  }
}

/** Delete every saved copy on this device. Called on sign-out. */
export async function clearSavedViews(): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    const tx = db.transaction(STORE, 'readwrite')
    tx.objectStore(STORE).clear()
    await done(tx)
    db.close()
  } catch {
    // Nothing useful to do; sign-out must carry on regardless.
  }
}
