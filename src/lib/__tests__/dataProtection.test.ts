import { describe, it, expect } from 'vitest'
import {
  defaultDueDate,
  isIsoDate,
  breachClock,
  requestClock,
  computeChecklist,
  buildPrivacyNotice,
  CONSENT_TYPE_IDS,
} from '../dataProtection'

const T = (s: string) => new Date(s)

describe('dates', () => {
  it('defaults a request due date to 30 days out', () => {
    expect(defaultDueDate(T('2026-10-27T10:00:00Z'))).toBe('2026-11-26')
    expect(defaultDueDate(T('2026-10-27T10:00:00Z'), 7)).toBe('2026-11-03')
  })

  it('validates ISO dates', () => {
    expect(isIsoDate('2026-10-27')).toBe(true)
    expect(isIsoDate('27/10/2026')).toBe(false)
    expect(isIsoDate('2026-13-45')).toBe(false)
    expect(isIsoDate(null)).toBe(false)
  })
})

describe('breachClock (72h NDPC window)', () => {
  const discovered = '2026-10-27T00:00:00Z'

  it('is open early in the window', () => {
    const c = breachClock({ discovered_at: discovered, ndpc_notified_at: null }, T('2026-10-27T12:00:00Z'))
    expect(c.state).toBe('open')
    expect(c.hoursRemaining).toBe(60)
    expect(c.deadline.toISOString()).toBe('2026-10-30T00:00:00.000Z')
  })

  it('is due_soon inside the last 24 hours', () => {
    const c = breachClock({ discovered_at: discovered, ndpc_notified_at: null }, T('2026-10-29T12:00:00Z'))
    expect(c.state).toBe('due_soon')
    expect(c.hoursRemaining).toBe(12)
  })

  it('is overdue after 72 hours', () => {
    const c = breachClock({ discovered_at: discovered, ndpc_notified_at: null }, T('2026-10-30T00:30:00Z'))
    expect(c.state).toBe('overdue')
  })

  it('is notified once the NDPC has been told, even after the deadline', () => {
    const c = breachClock(
      { discovered_at: discovered, ndpc_notified_at: '2026-10-29T09:00:00Z' },
      T('2026-11-10T00:00:00Z'),
    )
    expect(c.state).toBe('notified')
    expect(c.hoursRemaining).toBeNull()
  })
})

describe('requestClock', () => {
  const now = T('2026-10-27T10:00:00Z')
  it('treats completed and rejected as closed', () => {
    expect(requestClock({ status: 'completed', due_on: '2020-01-01' }, now).state).toBe('closed')
    expect(requestClock({ status: 'rejected', due_on: '2020-01-01' }, now).state).toBe('closed')
  })
  it('flags overdue, due_soon and open', () => {
    expect(requestClock({ status: 'open', due_on: '2026-10-26' }, now).state).toBe('overdue')
    expect(requestClock({ status: 'in_progress', due_on: '2026-11-03' }, now).state).toBe('due_soon')
    expect(requestClock({ status: 'open', due_on: '2026-11-20' }, now)).toEqual({ state: 'open', daysRemaining: 24 })
  })
  it('is not overdue on the due date itself', () => {
    expect(requestClock({ status: 'open', due_on: '2026-10-27' }, now).state).toBe('due_soon')
  })
})

describe('computeChecklist', () => {
  const now = T('2026-10-27T10:00:00Z')
  const full = {
    dpo_name: 'A. Bello',
    dpo_email: 'dpo@school.ng',
    ndpc_registration_number: 'DPCO-123',
    last_audit_return_year: 2025,
    privacy_notice_published_on: '2026-09-01',
  }

  it('scores 100 when everything is in place', () => {
    const r = computeChecklist({ settings: full, studentCount: 100, consentedStudents: 95, overdueRequests: 0, overdueBreaches: 0, now })
    expect(r.score).toBe(100)
    expect(r.items.every(i => i.ok)).toBe(true)
  })

  it('scores 0 for an empty school with open problems', () => {
    const r = computeChecklist({ settings: null, studentCount: 100, consentedStudents: 0, overdueRequests: 2, overdueBreaches: 1, now })
    expect(r.score).toBe(0)
  })

  it('needs BOTH DPO name and email', () => {
    const r = computeChecklist({ settings: { ...full, dpo_email: '  ' }, studentCount: 0, consentedStudents: 0, overdueRequests: 0, overdueBreaches: 0, now })
    expect(r.items.find(i => i.id === 'dpo')?.ok).toBe(false)
  })

  it('requires an audit return covering last year or later', () => {
    const old = computeChecklist({ settings: { ...full, last_audit_return_year: 2024 }, studentCount: 0, consentedStudents: 0, overdueRequests: 0, overdueBreaches: 0, now })
    expect(old.items.find(i => i.id === 'audit_return')?.ok).toBe(false)
  })

  it('does not penalise consent coverage when there are no learners yet', () => {
    const r = computeChecklist({ settings: full, studentCount: 0, consentedStudents: 0, overdueRequests: 0, overdueBreaches: 0, now })
    expect(r.items.find(i => i.id === 'consents')?.ok).toBe(true)
  })

  it('fails consent coverage below 90%', () => {
    const r = computeChecklist({ settings: full, studentCount: 100, consentedStudents: 89, overdueRequests: 0, overdueBreaches: 0, now })
    expect(r.items.find(i => i.id === 'consents')?.ok).toBe(false)
  })
})

describe('buildPrivacyNotice', () => {
  it('fills in school and DPO details', () => {
    const md = buildPrivacyNotice({
      schoolName: 'Bright Star College',
      dpoName: 'A. Bello',
      dpoEmail: 'dpo@brightstar.ng',
      ndpcRegistrationNumber: 'DPCO-123',
    })
    expect(md).toContain('# Privacy Notice – Bright Star College')
    expect(md).toContain('A. Bello | dpo@brightstar.ng')
    expect(md).toContain('DPCO-123')
    expect(md).toContain('72 hours')
  })

  it('leaves clear placeholders when details are missing', () => {
    const md = buildPrivacyNotice({ schoolName: 'X' })
    expect(md).toContain('[Data Protection Officer name and contact]')
    expect(md).toContain('[NDPC registration number]')
  })
})

describe('constants', () => {
  it('matches the consent_type CHECK in the migration', () => {
    expect(CONSENT_TYPE_IDS).toEqual(['data_processing', 'photo_media', 'biometric', 'ai_features'])
  })
})
