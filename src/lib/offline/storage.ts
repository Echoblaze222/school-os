// src/lib/offline/storage.ts
// CLIENT ONLY. Browsers may silently evict IndexedDB when the phone runs low on space,
// which would erase the local copy AND any queued offline changes. Ask the browser to
// treat this origin's storage as persistent, and report how much room is left.
// Never throws: if the browser has no storage API, offline mode just behaves as before.

export interface StorageHealth {
  /** True if the browser promised not to evict our data under storage pressure. */
  persistent: boolean
  /** Bytes used / available to this origin, when the browser reports them. */
  usage: number | null
  quota: number | null
  /** True when more than 80% of the quota is used. */
  nearlyFull: boolean
}

export async function requestPersistentStorage(): Promise<boolean> {
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!storage || typeof storage.persist !== 'function') return false
    if (typeof storage.persisted === 'function' && (await storage.persisted())) return true
    return await storage.persist()
  } catch {
    return false
  }
}

export async function getStorageHealth(): Promise<StorageHealth> {
  const empty: StorageHealth = { persistent: false, usage: null, quota: null, nearlyFull: false }
  try {
    const storage = typeof navigator !== 'undefined' ? navigator.storage : undefined
    if (!storage) return empty
    const persistent = typeof storage.persisted === 'function' ? await storage.persisted() : false
    const est = typeof storage.estimate === 'function' ? await storage.estimate() : {}
    const usage = typeof est.usage === 'number' ? est.usage : null
    const quota = typeof est.quota === 'number' ? est.quota : null
    return { persistent, usage, quota, nearlyFull: usage !== null && quota !== null && quota > 0 && usage / quota > 0.8 }
  } catch {
    return empty
  }
}
