// src/lib/__tests__/activateStudentSubscription.test.ts
//
// Per-student subscription activation. Shared by the Paystack webhook and the
// browser callback, so it must be idempotent and must never activate on a
// wrong reference, a missing pending row, or a short payment.

import { describe, it, expect, beforeEach } from 'vitest'
import { activateStudentSubscription } from '@/lib/activateStudentSubscription'
import { priceForStudent, STUDENT_REFERENCE_PREFIX } from '@/lib/studentBilling'

type Row = Record<string, unknown> | null
let pendingRow: Row
let updateError: { code?: string; message: string } | null
let updates: Record<string, unknown>[]
let inserts: Record<string, unknown>[][]
let profile: Row

const admin = {
  from: (table: string) => {
    const b: Record<string, any> = {}
    b.select = () => b
    b.eq = () => b
    b.maybeSingle = async () => ({ data: table === 'student_subscriptions' ? pendingRow : null })
    b.single = async () => ({ data: table === 'profiles' ? profile : null })
    b.update = (patch: Record<string, unknown>) => {
      updates.push(patch)
      return { eq: () => ({ eq: async () => ({ error: updateError }) }) }
    }
    b.insert = async (rows: Record<string, unknown>[]) => { inserts.push(rows); return { error: null } }
    return b
  },
}

const REF = `${STUDENT_REFERENCE_PREFIX}abc123`
const pending = (extra: Record<string, unknown> = {}) => ({
  id: 'r1', school_id: 's1', student_id: 'st1', term_id: 't1', status: 'pending', amount_ngn: 1000, payer_id: 'p1', ...extra,
})

beforeEach(() => {
  pendingRow = pending(); updateError = null; updates = []; inserts = []
  profile = { full_name: 'Ada', parent_id: 'par1' }
})

describe('activateStudentSubscription', () => {
  it('rejects a reference that is not from the student flow', async () => {
    expect(await activateStudentSubscription(admin, 'SCOS-xyz', 1000)).toEqual({ activated: false, reason: 'reference_not_from_student_flow' })
    expect(await activateStudentSubscription(admin, '', 1000)).toMatchObject({ activated: false })
    expect(updates).toEqual([])
  })
  it('rejects a reference with no pending row we wrote', async () => {
    pendingRow = null
    expect(await activateStudentSubscription(admin, REF, 1000)).toEqual({ activated: false, reason: 'no_matching_pending_payment' })
    expect(updates).toEqual([])
  })
  it('is idempotent: an already-paid row succeeds without updating or notifying again', async () => {
    pendingRow = pending({ status: 'paid' })
    expect(await activateStudentSubscription(admin, REF, 1000)).toEqual({ activated: true, studentId: 'st1' })
    expect(updates).toEqual([])
    expect(inserts).toEqual([])
  })
  it('refuses a short payment', async () => {
    expect(await activateStudentSubscription(admin, REF, 500)).toEqual({ activated: false, reason: 'amount_below_expected' })
    expect(updates).toEqual([])
  })
  it('accepts exactly the expected amount, within the ₦1 tolerance, or more', async () => {
    for (const paid of [1000, 999, 1500]) {
      updates = []; pendingRow = pending()
      expect(await activateStudentSubscription(admin, REF, paid)).toMatchObject({ activated: true, studentId: 'st1' })
      expect(updates[0]).toMatchObject({ status: 'paid' })
    }
    expect(await activateStudentSubscription(admin, REF, 998)).toMatchObject({ activated: false })
  })
  it('notifies the student and the parent once each on success', async () => {
    await activateStudentSubscription(admin, REF, 1000)
    expect(inserts).toHaveLength(1)
    expect(inserts[0].map(n => n.user_id).sort()).toEqual(['par1', 'st1'])
  })
  it('notifies only the student when there is no parent, and never duplicates', async () => {
    profile = { full_name: 'Ada', parent_id: null }
    await activateStudentSubscription(admin, REF, 1000)
    expect(inserts[0].map(n => n.user_id)).toEqual(['st1'])
    inserts = []; profile = { full_name: 'Ada', parent_id: 'st1' }
    await activateStudentSubscription(admin, REF, 1000)
    expect(inserts[0].map(n => n.user_id)).toEqual(['st1'])
  })
  it('a unique-index clash (already paid another way) counts as active but is flagged for refund review, with no notification', async () => {
    updateError = { code: '23505', message: 'duplicate key' }
    expect(await activateStudentSubscription(admin, REF, 1000)).toEqual({
      activated: true, studentId: 'st1', reason: 'duplicate_payment_needs_refund_review',
    })
    expect(inserts).toEqual([])
  })
  it('any other database error does not activate', async () => {
    updateError = { code: 'XX000', message: 'boom' }
    expect(await activateStudentSubscription(admin, REF, 1000)).toEqual({ activated: false, reason: 'update_failed:boom' })
    expect(inserts).toEqual([])
  })
})

describe('priceForStudent (size tiers, server-side)', () => {
  it('uses ₦1,000 / ₦2,000 / ₦3,000 per student at the 250 and 500 breakpoints', () => {
    expect(priceForStudent(1).amount).toBe(1000)
    expect(priceForStudent(250).amount).toBe(1000)
    expect(priceForStudent(251).amount).toBe(2000)
    expect(priceForStudent(500).amount).toBe(2000)
    expect(priceForStudent(501).amount).toBe(3000)
  })
})
