import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateActivationToken, hashActivationToken } from '@/lib/credentials'

// In-memory stand-in for Supabase that follows the SAME contract as the SQL
// functions in sql/migrations/2026-09-20-c1a-*.sql (consume = one atomic claim
// that fails for unknown / expired / used / revoked tokens, for accounts that
// are already activated, and for a different school). The real SQL is verified
// separately by the rolled-back dry run documented in the C1 doc.
const h = vi.hoisted(() => {
  type Profile = { id: string; email: string; role: string; school_id: string | null; onboarding_stage: string }
  type Cred = { userId: string; hash: string; expiresAt: number; usedAt: number | null; revokedAt: number | null }
  const state = {
    profiles: new Map<string, Profile>(),
    creds: [] as Cred[],
    passwordUpdates: [] as Array<{ id: string; password: string }>,
    failPassword: null as string | null,
    rateAllowed: true,
    makeAdmin: null as unknown as () => any,
  }
  state.makeAdmin = () => ({
    rpc: async (fn: string, args: any) => {
      if (fn === 'consume_activation_credential') {
        const c = state.creds.find(x => x.hash === args.p_token_hash && x.usedAt === null && x.revokedAt === null && x.expiresAt > Date.now())
        const p = c ? state.profiles.get(c.userId) : undefined
        const eligible = !!p && ['start', 'stage_1_pending'].includes(p.onboarding_stage)
        const schoolOk = !args.p_school_id || p?.school_id === args.p_school_id
        if (!c || !eligible || !schoolOk) return { data: null, error: null }
        c.usedAt = Date.now()
        return { data: c.userId, error: null }
      }
      if (fn === 'release_activation_credential') {
        const c = state.creds.find(x => x.userId === args.p_user_id && x.hash === args.p_token_hash && x.revokedAt === null)
        if (c) c.usedAt = null
        return { data: null, error: null }
      }
      throw new Error('unexpected rpc ' + fn)
    },
    from: (table: string) => {
      if (table !== 'profiles') throw new Error('unexpected table ' + table)
      let patch: any = null
      let id = ''
      const chain: any = {
        select: () => chain,
        update: (p: any) => { patch = p; return chain },
        eq: (_col: string, value: string) => {
          if (patch) {
            const p = state.profiles.get(value)
            if (p) Object.assign(p, patch)
            return Promise.resolve({ error: null })
          }
          id = value
          return chain
        },
        maybeSingle: async () => {
          const p = state.profiles.get(id)
          return { data: p ? { ...p, schools: p.school_id ? { id: p.school_id, name: 'Test School', primary_color: '#123456' } : null } : null, error: null }
        },
      }
      return chain
    },
    auth: {
      admin: {
        updateUserById: async (id: string, attrs: { password: string }) => {
          if (state.failPassword) return { error: { message: state.failPassword } }
          state.passwordUpdates.push({ id, password: attrs.password })
          return { error: null }
        },
      },
    },
  })
  return state
})

vi.mock('@/lib/rateLimit', () => ({
  getClientIp: () => '203.0.113.9',
  checkRateLimit: async () =>
    h.rateAllowed
      ? { allowed: true }
      : { allowed: false, errorResponse: { error: 'Too many attempts. Please wait a few minutes and try again.', status: 429, retryAfter: 60 } },
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: () => h.makeAdmin() }))

import { POST } from '../first-login/route'

function call(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/auth/first-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

function seed(opts: { id?: string; school?: string; stage?: string; ttlMs?: number } = {}) {
  const token = generateActivationToken()
  const id = opts.id ?? 'user-a'
  h.profiles.set(id, {
    id, email: `${id}@school.test`, role: 'teacher',
    school_id: opts.school ?? 'school-1',
    onboarding_stage: opts.stage ?? 'stage_1_pending',
  })
  h.creds.push({
    userId: id, hash: hashActivationToken(token)!,
    expiresAt: Date.now() + (opts.ttlMs ?? 3_600_000), usedAt: null, revokedAt: null,
  })
  return token
}

beforeEach(() => {
  h.profiles.clear()
  h.creds.length = 0
  h.passwordUpdates.length = 0
  h.failPassword = null
  h.rateAllowed = true
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key'
})

describe('POST /api/auth/first-login', () => {
  it('activates the right account with a correct token', async () => {
    const token = seed()
    const res = await call({ code: token, newPassword: 'CorrectHorse9', schoolId: 'school-1' })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json).toMatchObject({ success: true, email: 'user-a@school.test', role: 'teacher', onboarding_stage: 'stage_2_pending' })
    expect(h.passwordUpdates).toEqual([{ id: 'user-a', password: 'CorrectHorse9' }])
    expect(h.profiles.get('user-a')!.onboarding_stage).toBe('stage_2_pending')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('accepts the token in lowercase with spaces (people retype codes)', async () => {
    const token = seed()
    const res = await call({ code: token.toLowerCase().replace(/-/g, ' '), newPassword: 'CorrectHorse9' })
    expect(res.status).toBe(200)
  })

  it('rejects a wrong token and changes nothing', async () => {
    seed()
    const res = await call({ code: generateActivationToken(), newPassword: 'CorrectHorse9' })
    expect(res.status).toBe(400)
    expect(h.passwordUpdates).toHaveLength(0)
    expect(h.profiles.get('user-a')!.onboarding_stage).toBe('stage_1_pending')
  })

  it('rejects an expired token', async () => {
    const token = seed({ ttlMs: -1000 })
    const res = await call({ code: token, newPassword: 'CorrectHorse9' })
    expect(res.status).toBe(400)
    expect(h.passwordUpdates).toHaveLength(0)
  })

  it('a token works exactly once (reuse and replay are rejected)', async () => {
    const token = seed()
    expect((await call({ code: token, newPassword: 'FirstPassword1' })).status).toBe(200)
    const replay = await call({ code: token, newPassword: 'AttackerPass2' })
    expect(replay.status).toBe(400)
    expect(h.passwordUpdates).toEqual([{ id: 'user-a', password: 'FirstPassword1' }])
  })

  it('a token issued for one account can never activate another', async () => {
    const tokenA = seed({ id: 'user-a' })
    seed({ id: 'user-b' })
    const res = await call({ code: tokenA, newPassword: 'CorrectHorse9' })
    expect(res.status).toBe(200)
    expect(h.passwordUpdates.map(u => u.id)).toEqual(['user-a'])
    expect(h.profiles.get('user-b')!.onboarding_stage).toBe('stage_1_pending')
  })

  it.each(['stage_2_pending', 'stage_3_pending', 'complete'])(
    'refuses an already-activated account (stage %s) even with a live token',
    async stage => {
      const token = seed({ stage })
      const res = await call({ code: token, newPassword: 'AttackerPass2' })
      expect(res.status).toBe(400)
      expect(h.passwordUpdates).toHaveLength(0)
      expect(h.profiles.get('user-a')!.onboarding_stage).toBe(stage)
    },
  )

  it('rejects a token presented for a different school and leaves it usable for the right one', async () => {
    const token = seed({ school: 'school-1' })
    const wrong = await call({ code: token, newPassword: 'CorrectHorse9', schoolId: 'school-2' })
    expect(wrong.status).toBe(400)
    expect(h.passwordUpdates).toHaveLength(0)
    const right = await call({ code: token, newPassword: 'CorrectHorse9', schoolId: 'school-1' })
    expect(right.status).toBe(200)
  })

  it('does not accept a default_code (or any legacy access-code shape) as the credential', async () => {
    seed()
    h.profiles.get('user-a')!.school_id = 'school-1'
    for (const legacy of ['ABC-2026-0001', 'PRIN-528-F0A', 'SCH-AB12CD34', 'TEA-2026-XXXX']) {
      const res = await call({ code: legacy, newPassword: 'AttackerPass2' })
      expect(res.status).toBe(400)
    }
    expect(h.passwordUpdates).toHaveLength(0)
    expect(h.profiles.get('user-a')!.onboarding_stage).toBe('stage_1_pending')
  })

  it('never reveals the token, its hash, or whether the account exists in any response', async () => {
    const token = seed()
    const ok = JSON.stringify(await (await call({ code: token, newPassword: 'CorrectHorse9' })).json())
    const bad = JSON.stringify(await (await call({ code: token, newPassword: 'CorrectHorse9' })).json())
    for (const body of [ok, bad]) {
      expect(body).not.toContain(token)
      expect(body).not.toContain(hashActivationToken(token)!)
    }
    // failure bodies are identical no matter why they failed
    const unknown = JSON.stringify(await (await call({ code: generateActivationToken(), newPassword: 'x'.repeat(10) })).json())
    expect(bad).toBe(unknown)
    expect(bad).not.toContain('already_activated')
    expect(bad).not.toContain('@')
  })

  it('gives the token back when setting the password fails, so a retry works', async () => {
    const token = seed()
    h.failPassword = 'upstream unavailable'
    const failed = await call({ code: token, newPassword: 'CorrectHorse9' })
    expect(failed.status).toBe(500)
    expect(JSON.stringify(await failed.json())).not.toContain('upstream')
    expect(h.creds[0].usedAt).toBeNull()
    h.failPassword = null
    expect((await call({ code: token, newPassword: 'CorrectHorse9' })).status).toBe(200)
  })

  it('stops when rate limited, before touching any credential', async () => {
    const token = seed()
    h.rateAllowed = false
    const res = await call({ code: token, newPassword: 'CorrectHorse9' })
    expect(res.status).toBe(429)
    expect(h.creds[0].usedAt).toBeNull()
    expect(h.passwordUpdates).toHaveLength(0)
  })

  it('validates input', async () => {
    const token = seed()
    expect((await call({ newPassword: 'CorrectHorse9' })).status).toBe(400)
    expect((await call({ code: token })).status).toBe(400)
    expect((await call({ code: token, newPassword: 'short' })).status).toBe(400)
    expect(h.passwordUpdates).toHaveLength(0)
  })
})
