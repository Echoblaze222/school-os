// src/lib/__tests__/expirePendingSchools.test.ts
//
// Regression test for the production bug found via Vercel runtime logs:
// expirePendingSchools was attempting to hard-delete a school
// ("Kings College") that had is_platform_active = false (so it looked
// like an abandoned signup) but actually had 8 real profiles, 74
// subjects, and 4 real student fee invoices — i.e. genuine usage, most
// likely an activation-flow bug rather than an abandoned checkout. The
// delete failed every day on the payment_invoices FK, but had already
// silently deleted that school's registration-attempt log and
// placeholder subscription along the way before hitting the FK.
//
// This test proves the new guard (payment_invoices > 0, or more than
// the principal's own profile) skips the destructive path entirely and
// reports the school in `skipped` instead — while a school with no such
// signals still goes through the normal delete path.
//
// Supabase itself isn't reachable from this sandbox/CI, so this mocks
// just enough of the chainable query builder to exercise the real
// control flow in lib/expirePendingSchools.ts, matching the existing
// hand-rolled-mock convention already used in test-mock-supabase.mjs at
// the repo root.

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>
let db: Record<string, Map<string, Row>>

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeMockAdmin(),
}))

vi.mock('@/lib/logger', () => ({
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} },
}))

function matches(row: Row, filters: Record<string, any>) {
  return Object.entries(filters).every(([key, val]) => {
    if (key.endsWith('__lte')) return row[key.slice(0, -5)] <= val
    if (key.endsWith('__neq')) return row[key.slice(0, -5)] !== val
    return row[key] === val
  })
}

function table(name: string): Map<string, Row> {
  if (!db[name]) db[name] = new Map()
  return db[name]
}

function builder(tableName: string) {
  const state: { mode: 'select' | 'delete'; opts?: any; filters: Record<string, any> } = {
    mode: 'select',
    filters: {},
  }

  async function resolve() {
    const rows = [...table(tableName).values()].filter((r) => matches(r, state.filters))

    if (state.mode === 'delete') {
      for (const row of rows) {
        // Simulate the real FK: a payment_invoices row referencing a
        // school blocks that school's row from being deleted.
        if (tableName === 'schools' && [...table('payment_invoices').values()].some((pi) => pi.school_id === row.id)) {
          return { data: null, error: { message: 'update or delete on table "schools" violates foreign key constraint "payment_invoices_school_id_fkey" on table "payment_invoices"' } }
        }
        table(tableName).delete(row.id)
      }
      return { data: null, error: null }
    }

    if (state.opts?.count === 'exact' && state.opts?.head) {
      return { data: null, error: null, count: rows.length }
    }
    return { data: rows, error: null }
  }

  const chain: any = {
    select(_cols?: string, opts?: any) {
      state.mode = 'select'
      state.opts = opts
      return chain
    },
    delete() {
      state.mode = 'delete'
      return chain
    },
    eq(col: string, val: any) { state.filters[col] = val; return chain },
    lte(col: string, val: any) { state.filters[`${col}__lte`] = val; return chain },
    neq(col: string, val: any) { state.filters[`${col}__neq`] = val; return chain },
    maybeSingle: async () => {
      const rows = [...table(tableName).values()].filter((r) => matches(r, state.filters))
      return { data: rows[0] ?? null, error: null }
    },
    then: (onFulfilled: any, onRejected: any) => resolve().then(onFulfilled, onRejected),
  }
  return chain
}

function makeMockAdmin() {
  return {
    from: (t: string) => builder(t),
    auth: { admin: { deleteUser: async () => ({ error: null }) } },
    storage: { from: () => ({ list: async () => ({ data: [] }), remove: async () => ({ data: null, error: null }) }) },
  }
}

const longAgoIso = new Date(Date.now() - 400 * 60 * 60 * 1000).toISOString() // 400h ago, past every threshold

beforeEach(() => {
  db = {
    schools: new Map(),
    payment_invoices: new Map(),
    profiles: new Map(),
    subscriptions: new Map(),
    feature_flags: new Map(),
    subjects: new Map(),
    school_registration_attempts: new Map(),
  }
})

describe('expirePendingSchools', () => {
  it('skips (does not delete) a school with real usage data despite is_platform_active=false', async () => {
    table('schools').set('kings-college', {
      id: 'kings-college', name: 'Kings College', created_at: longAgoIso,
      is_platform_active: false, status: 'abandoned',
    })
    for (let i = 0; i < 4; i++) table('payment_invoices').set(`inv-${i}`, { id: `inv-${i}`, school_id: 'kings-college' })
    table('profiles').set('principal-1', { id: 'principal-1', school_id: 'kings-college', role: 'principal' })
    for (let i = 0; i < 7; i++) table('profiles').set(`staff-${i}`, { id: `staff-${i}`, school_id: 'kings-college', role: 'teacher' })

    const { expirePendingSchools } = await import('../expirePendingSchools')
    const result = await expirePendingSchools()

    expect(result.deleted).toHaveLength(0)
    expect(result.errors).toHaveLength(0) // no more daily FK-violation error spam
    expect(result.skipped).toHaveLength(1)
    expect(result.skipped[0].id).toBe('kings-college')
    expect(result.skipped[0].reason).toMatch(/real usage data/)
    expect(table('schools').has('kings-college')).toBe(true) // never touched
    expect(table('profiles').has('principal-1')).toBe(true) // never touched
  })

  it('still deletes a genuinely abandoned school (no invoices, only the principal profile)', async () => {
    table('schools').set('empty-school', {
      id: 'empty-school', name: 'Nobody Finished Signup', created_at: longAgoIso,
      is_platform_active: false, status: 'abandoned',
    })
    table('profiles').set('principal-2', { id: 'principal-2', school_id: 'empty-school', role: 'principal' })

    const { expirePendingSchools } = await import('../expirePendingSchools')
    const result = await expirePendingSchools()

    expect(result.skipped).toHaveLength(0)
    expect(result.errors).toHaveLength(0)
    expect(result.deleted).toHaveLength(1)
    expect(result.deleted[0].id).toBe('empty-school')
    expect(table('schools').has('empty-school')).toBe(false)
    expect(table('profiles').has('principal-2')).toBe(false)
  })
})
