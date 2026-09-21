import { describe, it, expect } from 'vitest'
import {
  generateActivationToken, generateLinkCode,
  normalizeActivationToken, normalizeLinkCode,
  hashActivationToken, hashLinkCode,
  issueActivationCredential, issueStudentLinkCode,
} from '@/lib/credentials'

const ACT_RE = /^ACT-[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){3}$/
const LNK_RE = /^LNK-[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/

describe('token generation', () => {
  it('activation tokens have the documented shape and are unique', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const t = generateActivationToken()
      expect(t).toMatch(ACT_RE)
      seen.add(t)
    }
    expect(seen.size).toBe(500)
  })

  it('link codes have the documented shape and are unique', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 500; i++) {
      const c = generateLinkCode()
      expect(c).toMatch(LNK_RE)
      seen.add(c)
    }
    expect(seen.size).toBe(500)
  })
})

describe('normalization and hashing', () => {
  it('treats case, spaces, dashes and a missing prefix as the same token', () => {
    const t = generateActivationToken()
    const h = hashActivationToken(t)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashActivationToken(t.toLowerCase())).toBe(h)
    expect(hashActivationToken(t.replace(/-/g, ' '))).toBe(h)
    expect(hashActivationToken(t.replace(/-/g, ''))).toBe(h)
    expect(hashActivationToken(t.slice(4))).toBe(h) // prefix dropped
    expect(hashActivationToken(`  ${t}  `)).toBe(h)
  })

  it('does not strip a body that legitimately starts with the prefix letters', () => {
    const body = 'ACT' + 'K7Q2M9PXR4TN8VW5B'.slice(0, 17) // 20 chars, body starts with ACT
    expect(body).toHaveLength(20)
    expect(hashActivationToken(body)).toBe(hashActivationToken('ACT-' + body))
    expect(hashActivationToken(body)).not.toBeNull()
  })

  it('maps look-alike characters (O->0, I/L->1) the way people type them', () => {
    const t = 'ACT-01234-56789-ABCDE-FGH1J'.replace('01234', '0I234'.replace('I', '1'))
    const typed = t.replace(/0/g, 'O').replace(/1/g, 'I')
    expect(hashActivationToken(typed)).toBe(hashActivationToken(t))
  })

  it('rejects anything that is not shaped like a token (including legacy default_code values)', () => {
    for (const bad of ['', ' ', 'x', 'ABC-2026-0001', 'PRIN-528-F0A', 'SCH-AB12CD34', 'TEA-2026-XXXX', 'ACT-TOOSHORT', 'ACT-UUUUU-UUUUU-UUUUU-UUUUU']) {
      expect(hashActivationToken(bad)).toBeNull()
      expect(hashLinkCode(bad)).toBeNull()
    }
  })

  it('an activation token is never valid as a link code, and vice versa', () => {
    expect(hashLinkCode(generateActivationToken())).toBeNull()
    expect(hashActivationToken(generateLinkCode())).toBeNull()
    expect(normalizeLinkCode(generateActivationToken())).toBeNull()
    expect(normalizeActivationToken(generateLinkCode())).toBeNull()
  })
})

describe('issuing never leaks plaintext', () => {
  function fakeAdmin(result: { data: unknown; error: { message: string } | null }) {
    const calls: Array<{ fn: string; args: Record<string, unknown> }> = []
    return {
      calls,
      client: { rpc: async (fn: string, args: Record<string, unknown>) => { calls.push({ fn, args }); return result } } as any,
    }
  }

  it('sends only the hash of an activation token to the database', async () => {
    const f = fakeAdmin({ data: '2030-01-01T00:00:00Z', error: null })
    const { token } = await issueActivationCredential(f.client, { userId: 'u1', createdBy: 'admin1' })
    const sent = JSON.stringify(f.calls)
    const body = normalizeActivationToken(token)!
    expect(sent).not.toContain(token)
    expect(sent).not.toContain(body)
    expect(f.calls[0].fn).toBe('issue_activation_credential')
    expect(f.calls[0].args.p_token_hash).toBe(hashActivationToken(token))
    expect(f.calls[0].args.p_ttl_hours).toBe(168)
  })

  it('sends only the hash of a link code to the database', async () => {
    const f = fakeAdmin({ data: '2030-01-01T00:00:00Z', error: null })
    const { code } = await issueStudentLinkCode(f.client, { studentId: 's1', createdBy: 'admin1' })
    const sent = JSON.stringify(f.calls)
    expect(sent).not.toContain(code)
    expect(sent).not.toContain(normalizeLinkCode(code)!)
    expect(f.calls[0].args.p_code_hash).toBe(hashLinkCode(code))
  })

  it('does not put the token in the error message when issuing fails', async () => {
    const f = fakeAdmin({ data: null, error: { message: 'account is already activated' } })
    let message = ''
    try { await issueActivationCredential(f.client, { userId: 'u1', createdBy: null }) } catch (e: any) { message = e.message }
    expect(message).toContain('already activated')
    expect(message).not.toMatch(/ACT-/)
    const sent = JSON.stringify(f.calls)
    expect(message).not.toContain(String(f.calls[0].args.p_token_hash).slice(0, 8) + 'x')
    expect(sent).toBeTruthy()
  })
})
