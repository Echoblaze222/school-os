// src/lib/offline/cache.ts
// CLIENT ONLY. Read-through cache for data a user has already loaded, so screens
// can paint instantly from the device and still work with no network.
//
// Rules
//  - Entries are scoped to user + school. A different account on the same phone
//    never sees them.
//  - clearCache(userId) MUST be called on sign-out (wired in Phase 2, before any
//    screen starts writing to this cache).
//  - Storage problems (private mode, quota, IndexedDB blocked) never break the
//    normal online path: reads fall back to the network, writes are skipped.

import { getDb, offlineStorageAvailable } from './db'

function keyOf(userId: string, schoolId: string, name: string): string {
  return `${userId}:${schoolId}:${name}`
}

export async function cacheSet(userId: string, schoolId: string, name: string, value: unknown): Promise<void> {
  if (!offlineStorageAvailable()) return
  try {
    await getDb().cache.put({ key: keyOf(userId, schoolId, name), userId, schoolId, name, value, savedAt: Date.now() })
  } catch {
    // best effort
  }
}

export async function cacheGet<T>(
  userId: string,
  schoolId: string,
  name: string,
): Promise<{ value: T; savedAt: number } | null> {
  if (!offlineStorageAvailable()) return null
  try {
    const hit = await getDb().cache.get(keyOf(userId, schoolId, name))
    return hit ? { value: hit.value as T, savedAt: hit.savedAt } : null
  } catch {
    return null
  }
}

/** Remove every cached entry belonging to a user (sign-out). */
export async function clearCache(userId: string): Promise<void> {
  if (!offlineStorageAvailable()) return
  try {
    await getDb().cache.where('userId').equals(userId).delete()
  } catch {
    // best effort
  }
}

export interface ReadThroughResult<T> {
  value: T
  /** True when the network failed and this is the last-known copy. */
  fromCache: boolean
  /** Epoch ms of when this copy was fetched; use for "Last updated ..." text. */
  savedAt: number
}

/**
 * Stale-while-revalidate:
 *   1. if a cached copy exists, hand it to onCached() immediately (instant paint);
 *   2. call fetcher() for fresh data and store it;
 *   3. if fetcher() throws and a cached copy exists, return that instead.
 * fetcher must THROW on failure (wrap a Supabase { error } result).
 */
export async function readThrough<T>(opts: {
  userId: string
  schoolId: string
  name: string
  fetcher: () => Promise<T>
  onCached?: (value: T, savedAt: number) => void
}): Promise<ReadThroughResult<T>> {
  const { userId, schoolId, name, fetcher, onCached } = opts
  const cached = await cacheGet<T>(userId, schoolId, name)
  if (cached) onCached?.(cached.value, cached.savedAt)

  try {
    const fresh = await fetcher()
    await cacheSet(userId, schoolId, name, fresh)
    return { value: fresh, fromCache: false, savedAt: Date.now() }
  } catch (err) {
    if (cached) return { value: cached.value, fromCache: true, savedAt: cached.savedAt }
    throw err
  }
}
