// src/lib/__tests__/authUserAndSubscription.test.ts
//
// getAuthUser(): verifies via getClaims() (local JWT check), never getUser().
// checkSubscription(): ONE profile query (profile + school embed), plus - for
// students only - the per-student lock check (my_subscription_lock RPC).
//
// Billing is per student (sql/migrations/2026-11-21-per-student-subscriptions.sql):
// a school never locks because of money. Only a HARD lock (super admin suspended
// the school, 'locked', an unpaid-setup 'expired' trial, or is_platform_active =
// false) blocks everyone; otherwise only a student whose own term subscription is
// unpaid is locked. These tests previously described the older school-level
// billing lock and had gone stale.

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Claims = { sub?: string; email?: unknown } | null
let claims: Claims
let authCalls: string[]
let tables: string[]
let rpcCalls: string[]
let profileRow: Record<string, unknown> | null
let lockResult: { locked?: boolean } | null

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
    // The per-student lock check. A missing RPC (migration not applied) returns no data.
    rpc: async (name: string) => {
      rpcCalls.push(name)
      return { data: lockResult }
    },
  }),
}))

const { getAuthUser } = await import('@/lib/supabase/authUser')
const { checkSubscription } = await import('@/lib/subscription')

beforeEach(() => {
  claims = { sub: 'u1', email: 'a@b.c' }
  authCalls = []
  tables = []
  rpcCalls = []
  profileRow = null
  lockResult = { locked: false }
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

// NOTE: checkSubscription is wrapped in React cache(), so every call below uses a
// unique user id to avoid being answered from a previous call's result.
describe('checkSubscription', () => {
  it('a student costs ONE profile query plus the per-student lock check', async () => {
    profileRow = row('student', school('active'))
    await checkSubscription('one-query')
    expect(tables).toEqual(['profiles'])
    expect(rpcCalls).toEqual(['my_subscription_lock'])
  })

  it('staff, principals and parents never run the per-student lock check', async () => {
    for (const role of ['teacher', 'principal', 'parent']) {
      profileRow = row(role, school('active'))
      const result = await checkSubscription(`no-lock-check-${role}`)
      expect(result.locked).toBe(false)
    }
    expect(rpcCalls).toEqual([])
  })

  it('an active school with a paid student is not locked and carries name and colour', async () => {
    profileRow = row('student', school('active'))
    expect(await checkSubscription('active')).toEqual({
      locked: false, hardLocked: false, studentLocked: false, status: 'active',
      schoolName: 'Greenfield', schoolColor: '#123456',
    })
  })

  it('an unpaid student is locked, and only that student', async () => {
    lockResult = { locked: true }
    profileRow = row('student', school('active'))
    expect(await checkSubscription('unpaid-student')).toMatchObject({
      locked: true, hardLocked: false, studentLocked: true, status: 'student_unpaid',
    })
    profileRow = row('teacher', school('active'))
    expect((await checkSubscription('unpaid-but-teacher')).locked).toBe(false)
  })

  it('a missing lock function or empty answer fails open (not locked)', async () => {
    lockResult = null
    profileRow = row('student', school('active'))
    expect((await checkSubscription('fail-open')).locked).toBe(false)
  })

  it('hard lock (locked, expired setup, or platform inactive) blocks everyone including the principal', async () => {
    profileRow = row('principal', school('locked'))
    expect(await checkSubscription('hard-locked')).toMatchObject({ locked: true, hardLocked: true })
    profileRow = row('principal', school('expired'))
    expect(await checkSubscription('hard-expired')).toMatchObject({ locked: true, hardLocked: true })
    profileRow = row('teacher', school('active', false))
    expect(await checkSubscription('hard-inactive')).toMatchObject({ locked: true, hardLocked: true })
    // A hard lock already decides the answer: no per-student lookup is made.
    profileRow = row('student', school('locked'))
    expect(await checkSubscription('hard-student')).toMatchObject({ locked: true, hardLocked: true })
    expect(rpcCalls).toEqual([])
  })

  it('the old school billing states no longer lock anyone on their own', async () => {
    for (const status of ['suspended', 'grace_period', 'cancelled']) {
      profileRow = row('principal', school(status))
      expect((await checkSubscription(`old-${status}-principal`)).locked).toBe(false)
      profileRow = row('student', school(status))
      expect((await checkSubscription(`old-${status}-student`)).locked).toBe(false)
    }
  })

  it('handles the embed arriving as a one-item array', async () => {
    profileRow = row('student', [school('expired')] as unknown as Record<string, unknown>)
    expect(await checkSubscription('array-embed')).toMatchObject({ locked: true, hardLocked: true })
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
