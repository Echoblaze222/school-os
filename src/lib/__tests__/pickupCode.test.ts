import { describe, it, expect } from 'vitest'
import {
  generatePickupCode,
  normalizePickupCode,
  isValidPickupCode,
  hashPickupCode,
  pickupCodeMatches,
  isLockedOut,
  MAX_FAILED_ATTEMPTS,
} from '../pickupCode'

const SECRET = 'test-secret'

describe('pickup codes', () => {
  it('generates 6-digit numeric codes', () => {
    for (let i = 0; i < 200; i++) expect(generatePickupCode()).toMatch(/^\d{6}$/)
  })

  it('normalises and validates input', () => {
    expect(normalizePickupCode(' 12 34-56 ')).toBe('123456')
    expect(normalizePickupCode(null)).toBe('')
    expect(isValidPickupCode('123456')).toBe(true)
    expect(isValidPickupCode('12345')).toBe(false)
    expect(isValidPickupCode('1234567')).toBe(false)
    expect(isValidPickupCode('12345a')).toBe(false)
  })

  it('matches the right code for the right row only', () => {
    const hash = hashPickupCode('123456', 'row-1', SECRET)
    expect(pickupCodeMatches('123456', 'row-1', hash, SECRET)).toBe(true)
    expect(pickupCodeMatches('123457', 'row-1', hash, SECRET)).toBe(false)
    expect(pickupCodeMatches('123456', 'row-2', hash, SECRET)).toBe(false)
    expect(pickupCodeMatches('123456', 'row-1', hash, 'other-secret')).toBe(false)
  })

  it('gives the same digits a different hash per row', () => {
    expect(hashPickupCode('123456', 'a', SECRET)).not.toBe(hashPickupCode('123456', 'b', SECRET))
  })

  it('does not throw on a malformed stored hash', () => {
    expect(pickupCodeMatches('123456', 'row-1', 'nothex', SECRET)).toBe(false)
    expect(pickupCodeMatches('123456', 'row-1', '', SECRET)).toBe(false)
  })
})

describe('isLockedOut', () => {
  const now = new Date('2026-10-27T10:00:00Z')
  const at = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60000).toISOString()

  it('locks after the maximum failures inside the window', () => {
    const fails = Array.from({ length: MAX_FAILED_ATTEMPTS }, (_, i) => at(i + 1))
    expect(isLockedOut(fails, now)).toBe(true)
  })

  it('does not lock below the maximum', () => {
    expect(isLockedOut([at(1), at(2), at(3)], now)).toBe(false)
  })

  it('ignores failures older than the window', () => {
    const old = Array.from({ length: MAX_FAILED_ATTEMPTS }, () => at(60))
    expect(isLockedOut(old, now)).toBe(false)
  })
})
