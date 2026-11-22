// src/lib/__tests__/authUserAndSubscription.test.ts
//
// getAuthUser(): verifies via getClaims() (local JWT check), never getUser().
// checkSubscription(): ONE table query (profile + school embed). Billing is per
// student: a school never locks for billing, only an unpaid student does (via
// the my_subscription_lock RPC). Whole-school locks are only super-admin
// 'locked', is_platform_active=false, or an unpaid-setup 'expired' trial.

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Claims = { sub?: string; email?: unknown } | null
let claims: Claims
let authCalls: string[]
let tables: string[]
let rpcCalls: string[]
let lockResult: { locked?: boolean } | null
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
    rpc: async (name: string) => {
      rpcCalls.push(name)
      return { data: lockResult }
    },
  }),
}))

const { getAuthUser } = await import('@/lib/supabase/authUser')
const { checkSubscription } = await import('@/lib/subscription')

beforeEach(() => {
  claims = { sub: 'u1', email: 'a@b.c' }; authCalls = []; tables = []; rpcCalls = []; lockResult = { locked: false }; profileRow = null
})

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
      locked: false, hardLocked: false, studentLocked: false, status: 'active', schoolName: 'Greenfield', schoolColor: '#123456',
    })
  })
  it('an unpaid-setup expired school is a whole-school lock, principal included', async () => {
    for (const role of ['student', 'teacher', 'principal']) {
      profileRow = row(role, school('expired'))
      expect(await checkSubscription(`expired-${role}`)).toMatchObject({ locked: true, hardLocked: true })
    }
  })
  it('the old school billing states (grace_period/suspended/cancelled) no longer lock anyone', async () => {
    for (const status of ['grace_period', 'suspended', 'cancelled']) {
      for (const role of ['student', 'teacher', 'principal', 'parent']) {
        profileRow = row(role, school(status))
        expect(await checkSubscription(`${status}-${role}`)).toMatchObject({ locked: false, hardLocked: false })
      }
    }
  })
  it('an unpaid student is locked on their own, while the school stays open', async () => {
    profileRow = row('student', school('active'))
    lockResult = { locked: true }
    expect(await checkSubscription('unpaid-student')).toMatchObject({
      locked: true, hardLocked: false, studentLocked: true, status: 'student_unpaid',
    })
    expect(rpcCalls).toEqual(['my_subscription_lock'])
  })
  it('a paid student is not locked', async () => {
    profileRow = row('student', school('active'))
    lockResult = { locked: false }
    expect((await checkSubscription('paid-student')).locked).toBe(false)
  })
  it('a missing or failed lock answer fails open (no term, or migration not applied)', async () => {
    profileRow = row('student', school('active'))
    lockResult = null
    expect((await checkSubscription('failopen-student')).locked).toBe(false)
  })
  it('staff, principals and parents are never student-locked and skip the lock query', async () => {
    lockResult = { locked: true }
    for (const role of ['teacher', 'principal', 'parent', 'bursar']) {
      profileRow = row(role, school('active'))
      expect((await checkSubscription(`never-${role}`)).locked).toBe(false)
    }
    expect(rpcCalls).toEqual([])
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
