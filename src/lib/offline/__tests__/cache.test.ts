import 'fake-indexeddb/auto' // must load before Dexie so it finds an IndexedDB
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { __resetOfflineDbForTests } from '../db'
import { cacheGet, cacheSet, clearCache, readThrough } from '../cache'

beforeEach(async () => {
  await __resetOfflineDbForTests()
})

describe('cache scoping', () => {
  it('round-trips and is scoped to user and school', async () => {
    await cacheSet('u1', 's1', 'classes', [1, 2])
    expect((await cacheGet('u1', 's1', 'classes'))?.value).toEqual([1, 2])
    expect(await cacheGet('u2', 's1', 'classes')).toBeNull()
    expect(await cacheGet('u1', 's2', 'classes')).toBeNull()
  })

  it('clearCache removes only that user', async () => {
    await cacheSet('u1', 's1', 'a', 1)
    await cacheSet('u2', 's1', 'a', 2)
    await clearCache('u1')
    expect(await cacheGet('u1', 's1', 'a')).toBeNull()
    expect((await cacheGet('u2', 's1', 'a'))?.value).toBe(2)
  })
})

describe('readThrough', () => {
  const keys = { userId: 'u1', schoolId: 's1', name: 'students' }

  it('fetches and stores when nothing is cached', async () => {
    const res = await readThrough({ ...keys, fetcher: async () => ['x'] })
    expect(res).toMatchObject({ value: ['x'], fromCache: false })
    expect((await cacheGet('u1', 's1', 'students'))?.value).toEqual(['x'])
  })

  it('paints the cached copy first, then returns fresh data', async () => {
    await cacheSet('u1', 's1', 'students', ['old'])
    const onCached = vi.fn()
    const res = await readThrough({ ...keys, onCached, fetcher: async () => ['new'] })
    expect(onCached).toHaveBeenCalledWith(['old'], expect.any(Number))
    expect(res).toMatchObject({ value: ['new'], fromCache: false })
  })

  it('falls back to the cached copy when the network fails', async () => {
    await cacheSet('u1', 's1', 'students', ['old'])
    const res = await readThrough({
      ...keys,
      fetcher: async () => {
        throw new Error('Failed to fetch')
      },
    })
    expect(res).toMatchObject({ value: ['old'], fromCache: true })
  })

  it('rejects when the network fails and there is no cached copy', async () => {
    await expect(
      readThrough({
        ...keys,
        fetcher: async () => {
          throw new Error('Failed to fetch')
        },
      }),
    ).rejects.toThrow('Failed to fetch')
  })
})
