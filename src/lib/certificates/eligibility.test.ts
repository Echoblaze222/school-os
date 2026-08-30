// src/lib/certificates/eligibility.test.ts
import { describe, it, expect } from 'vitest'
import { isStudentEligibleForGraduationCertificate } from './eligibility'

const student = { id: 's1', school_id: 'sch1', lifecycle_stage: 'graduated' }
const record  = { id: 'g1', student_id: 's1', school_id: 'sch1', graduation_year: 2026, final_class: 'SSS3' }

describe('isStudentEligibleForGraduationCertificate', () => {
  it('is eligible when graduated with a matching graduation record and no existing certificate', () => {
    const result = isStudentEligibleForGraduationCertificate(student, record, null)
    expect(result.eligible).toBe(true)
    expect(result.reasons).toHaveLength(0)
  })

  it('rejects a student with no graduation record', () => {
    const result = isStudentEligibleForGraduationCertificate(student, null, null)
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('No graduation record exists for this student.')
  })

  it('rejects a student not marked graduated, even with a graduation record present', () => {
    const notGraduated = { ...student, lifecycle_stage: 'enrolled' }
    const result = isStudentEligibleForGraduationCertificate(notGraduated, record, null)
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('Student is not marked as graduated.')
  })

  it('rejects when an active (non-revoked) certificate already exists', () => {
    const result = isStudentEligibleForGraduationCertificate(student, record, { id: 'c1', status: 'issued' })
    expect(result.eligible).toBe(false)
    expect(result.reasons[0]).toMatch(/already exists/)
  })

  it('allows reissuance once the prior certificate is revoked', () => {
    const result = isStudentEligibleForGraduationCertificate(student, record, { id: 'c1', status: 'revoked' })
    expect(result.eligible).toBe(true)
  })

  it('rejects a graduation record belonging to a different school (cross-tenant guard)', () => {
    const wrongSchoolRecord = { ...record, school_id: 'other-school' }
    const result = isStudentEligibleForGraduationCertificate(student, wrongSchoolRecord, null)
    expect(result.eligible).toBe(false)
    expect(result.reasons).toContain('Graduation record belongs to a different school.')
  })

  it('rejects when the student record itself is missing', () => {
    const result = isStudentEligibleForGraduationCertificate(null, record, null)
    expect(result.eligible).toBe(false)
  })
})
