import 'fake-indexeddb/auto' // must load before Dexie so it finds an IndexedDB
import { describe, it, expect, beforeEach } from 'vitest'
import { __resetOfflineDbForTests, getDb } from '../db'
import { checkVerifier, storeVerifier, MAX_OFFLINE_ATTEMPTS } from '../unlockVerifier'

const FAST = 1000 // iterations; the real default is 600,000 and too slow for tests

beforeEach(async () => {
  await __resetOfflineDbForTests()
})

describe('offline unlock verifier', () => {
  it('accepts the right password and clears the failure counter', async () => {
    await storeVerifier('u1', 'correct horse', FAST)
    expect(await checkVerifier('u1', 'nope')).toEqual({ result: 'wrong', attemptsLeft: MAX_OFFLINE_ATTEMPTS - 1 })
    expect(await checkVerifier('u1', 'correct horse')).toEqual({ result: 'ok' })
    expect((await getDb().unlock.get('u1'))?.failedAttempts).toBe(0)
  })

  it('locks out after the fifth wrong try and deletes the verifier', async () => {
    await storeVerifier('u1', 'correct horse', FAST)
    for (let i = 1; i < MAX_OFFLINE_ATTEMPTS; i++) {
      expect(await checkVerifier('u1', 'nope')).toEqual({ result: 'wrong', attemptsLeft: MAX_OFFLINE_ATTEMPTS - i })
    }
    expect(await checkVerifier('u1', 'nope')).toEqual({ result: 'locked-out' })
    expect(await getDb().unlock.get('u1')).toBeUndefined()
  })

  it('the right password no longer works once locked out', async () => {
    await storeVerifier('u1', 'correct horse', FAST)
    for (let i = 0; i < MAX_OFFLINE_ATTEMPTS; i++) await checkVerifier('u1', 'nope')
    expect(await checkVerifier('u1', 'correct horse')).toEqual({ result: 'unavailable' })
  })

  it('saves the attempt count so a restart cannot reset it', async () => {
    await storeVerifier('u1', 'correct horse', FAST)
    await checkVerifier('u1', 'nope')
    await checkVerifier('u1', 'nope')
    expect((await getDb().unlock.get('u1'))?.failedAttempts).toBe(2)
  })

  it('keeps users separate', async () => {
    await storeVerifier('u1', 'one-password', FAST)
    await storeVerifier('u2', 'two-password', FAST)
    expect((await checkVerifier('u1', 'two-password')).result).toBe('wrong')
    expect(await checkVerifier('u2', 'two-password')).toEqual({ result: 'ok' })
  })

  it('never stores the password itself', async () => {
    await storeVerifier('u1', 'correct horse battery', FAST)
    const record = await getDb().unlock.get('u1')
    expect(JSON.stringify(record)).not.toContain('correct horse battery')
    expect(record?.hash.length).toBeGreaterThan(20)
  })

  it('storing again replaces the old password', async () => {
    await storeVerifier('u1', 'old-password', FAST)
    await storeVerifier('u1', 'new-password', FAST)
    expect((await checkVerifier('u1', 'old-password')).result).toBe('wrong')
    expect(await checkVerifier('u1', 'new-password')).toEqual({ result: 'ok' })
  })

  it('is unavailable when nothing was stored', async () => {
    expect(await checkVerifier('ghost', 'x')).toEqual({ result: 'unavailable' })
  })
})
