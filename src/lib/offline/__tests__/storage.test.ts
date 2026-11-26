import { afterEach, describe, expect, it, vi } from 'vitest'
import { getStorageHealth, requestPersistentStorage } from '../storage'

function setNavigator(storage: unknown) {
  vi.stubGlobal('navigator', { storage })
}
afterEach(() => vi.unstubAllGlobals())

describe('storage', () => {
  it('returns false and never throws when the browser has no storage API', async () => {
    setNavigator(undefined)
    expect(await requestPersistentStorage()).toBe(false)
    expect((await getStorageHealth()).persistent).toBe(false)
  })
  it('does not re-ask when already persistent', async () => {
    const persist = vi.fn()
    setNavigator({ persisted: async () => true, persist })
    expect(await requestPersistentStorage()).toBe(true)
    expect(persist).not.toHaveBeenCalled()
  })
  it('asks once and reports the answer', async () => {
    setNavigator({ persisted: async () => false, persist: async () => true })
    expect(await requestPersistentStorage()).toBe(true)
  })
  it('flags nearly full storage above 80%', async () => {
    setNavigator({ persisted: async () => true, estimate: async () => ({ usage: 85, quota: 100 }) })
    expect((await getStorageHealth()).nearlyFull).toBe(true)
    setNavigator({ persisted: async () => true, estimate: async () => ({ usage: 10, quota: 100 }) })
    expect((await getStorageHealth()).nearlyFull).toBe(false)
  })
  it('swallows errors', async () => {
    setNavigator({ persisted: async () => { throw new Error('x') } })
    expect(await requestPersistentStorage()).toBe(false)
  })
})
