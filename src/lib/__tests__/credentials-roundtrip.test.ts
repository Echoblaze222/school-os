import { describe, it, expect } from 'vitest'
import {
  generateActivationToken, generateLinkCode,
  hashActivationToken, hashLinkCode,
  normalizeActivationToken, normalizeLinkCode,
} from '@/lib/credentials'

// Regression guard: a freshly generated secret must always hash, and hash to
// the same value however a person types it. (An earlier version applied the
// look-alike mapping to the 'L' in the LNK prefix, so no link code could ever
// be hashed. The first CI run caught it.)
describe('generated secrets always round-trip', () => {
  it('every generated activation token hashes, however it is typed', () => {
    for (let i = 0; i < 300; i++) {
      const t = generateActivationToken()
      const h = hashActivationToken(t)
      expect(h).toMatch(/^[0-9a-f]{64}$/)
      expect(hashActivationToken(t.toLowerCase())).toBe(h)
      expect(hashActivationToken(t.replace(/-/g, ''))).toBe(h)
      expect(hashActivationToken(t.slice(4))).toBe(h)
      expect(normalizeActivationToken(t)).toHaveLength(20)
    }
  })

  it('every generated link code hashes, however it is typed', () => {
    for (let i = 0; i < 300; i++) {
      const c = generateLinkCode()
      const h = hashLinkCode(c)
      expect(h).toMatch(/^[0-9a-f]{64}$/)
      expect(hashLinkCode(c.toLowerCase())).toBe(h)
      expect(hashLinkCode(c.replace(/-/g, ' '))).toBe(h)
      expect(hashLinkCode(c.slice(4))).toBe(h)
      expect(normalizeLinkCode(c)).toHaveLength(16)
    }
  })

  it('different codes hash differently', () => {
    const hashes = new Set<string>()
    for (let i = 0; i < 300; i++) hashes.add(hashLinkCode(generateLinkCode())!)
    expect(hashes.size).toBe(300)
  })
})
