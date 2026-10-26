// src/lib/__tests__/authUserAndSubscription.test.ts
//
// getAuthUser(): verifies via getClaims() (local JWT check), never getUser().
// checkSubscription(): ONE database query (profile + school embed) instead of
// two sequential ones, with identical lock semantics to before.

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Claims = { sub?: string; email?: unknown } | null
let claims: Claims
let authCalls: string[]
let tables: string[]
let profileRow: Record<string, unknown> | null

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: {
      getClaims: async () => {
        authCalls.push('getClaims')
        return claims ? { data: { claims }, error: null } : { data: null, error: { message: 'no session' } }
      },
      getUser: async () => { authCalls.push('getUser'); return { data: { user: null } } },
    },
    from: (table: string) => {
      tables.push(table)
      const b: Record<string, unknown> = {}
      for (const m of ['select', 'eq']) b[m] = () => b
      b.single = async () => ({ data: table === 'profiles' ? profileRow : null })
      return b
    },
  }),
}))

const { getAuthUser } = await import('@/lib/supabase/authUser')
const { checkSubscription } = await import('@/lib/subscription')

beforeEach(() => { claims = { sub: 'u1', email: 'a@b.c' }; authCalls = []; tables = []; profileRow = null })

describe('getAuthUser', () => {
  it('returns id and email from verified claims, using getClaims and never getUser', async () => {
    expect(await getAuthUser()).toEqual({ id: 'u1', email: 'a@b.c' })
    expect(authCalls).toEqual(['getClaims'])
  })
  it('returns null when there is no valid session', async () => {
    claims = null
    expect(await getAuthUser()).toBeNull()
  })
  it('returns null when the claims have no subject', async () => {
    claims = { email: 'x@y.z' }
    expect(await getAuthUser()).toBeNull()
  })
  it('ignores a non-string email claim', async () => {
    claims = { sub: 'u2', email: 42 }
    expect(await getAuthUser()).toEqual({ id: 'u2', email: undefined })
  })
})

const row = (role: string, school: Record<string, unknown> | null, school_id: string | null = 's1') =>
  ({ role, school_id, school })
const school = (setup_status: string, is_platform_active = true) =>
  ({ name: 'Greenfield', primary_color: '#123456', setup_status, is_platform_active })

describe('checkSubscription (single query)', () => {
  it('makes exactly ONE database query', async () => {
    profileRow = row('student', school('active'))
    await checkSubscription('one-query')
    expect(tables).toEqual(['profiles'])
  })
  it('active school is not locked and carries name and colour', async () => {
    profileRow = row('student', school('active'))
    expect(await checkSubscription('active')).toEqual({
      locked: false, hardLocked: false, status: 'active', schoolName: 'Greenfield', schoolColor: '#123456',
    })
  })
  it('billing lock (expired/suspended/cancelled) locks non-principals but not the principal', async () => {
    for (const status of ['expired', 'suspended', 'cancelled']) {
      profileRow = row('student', school(status))
      expect((await checkSubscription(`stu-${status}`)).locked).toBe(true)
      profileRow = row('principal', school(status))
      const p = await checkSubscription(`pri-${status}`)
      expect(p.locked).toBe(false)
      expect(p.hardLocked).toBe(false)
    }
  })
  it('hard lock blocks everyone including the principal', async () => {
    profileRow = row('principal', school('locked'))
    expect(await checkSubscription('hard-1')).toMatchObject({ locked: true, hardLocked: true })
    profileRow = row('teacher', school('active', false))
    expect(await checkSubscription('hard-2')).toMatchObject({ locked: true, hardLocked: true })
  })
  it('handles the embed arriving as a one-item array', async () => {
    profileRow = row('student', [school('expired')] as unknown as Record<string, unknown>)
    expect((await checkSubscription('array-embed')).locked).toBe(true)
  })
  it('no profile, no school_id, or no school row means not locked', async () => {
    profileRow = null
    expect((await checkSubscription('none-1')).locked).toBe(false)
    profileRow = row('parent', null, null)
    expect((await checkSubscription('none-2')).locked).toBe(false)
    profileRow = row('student', null)
    expect((await checkSubscription('none-3')).locked).toBe(false)
  })
})
