// src/lib/certificates/eligibility.ts
// -------------------------------------------------------
// Pure eligibility rules (§23 of the certificate spec). No I/O — the
// caller (the API route) fetches the student profile and graduation
// record with the service-role client and passes the plain data in
// here. Kept separate so it's trivially unit-testable and so "why isn't
// this student eligible" always has a structured, specific reason
// instead of a generic block.
// -------------------------------------------------------

export interface EligibilityStudent {
  id: string
  school_id: string | null
  lifecycle_stage: string | null // profiles.lifecycle_stage
}

export interface EligibilityGraduationRecordShape {
  id: string
  student_id: string
  school_id: string
  graduation_year: number
  final_class: string
}
export type EligibilityGraduationRecord = EligibilityGraduationRecordShape | null

export interface EligibilityExistingCertificateShape {
  id: string
  status: 'draft' | 'pending_approval' | 'issued' | 'revoked'
}
export type EligibilityExistingCertificate = EligibilityExistingCertificateShape | null

export interface EligibilityPolicy {
  /** If true, a graduation_records row is mandatory. Default true. */
  requireGraduationRecord?: boolean
  /** If true, profiles.lifecycle_stage must already be 'graduated'. Default true. */
  requireGraduatedStatus?: boolean
}

export interface EligibilityCheckResult {
  eligible: boolean
  reasons: string[]
}

export function isStudentEligibleForGraduationCertificate(
  student: EligibilityStudent | null,
  graduationRecord: EligibilityGraduationRecord,
  existingCertificate: EligibilityExistingCertificate,
  policy: EligibilityPolicy = {},
): EligibilityCheckResult {
  const reasons: string[] = []
  const requireGraduationRecord = policy.requireGraduationRecord ?? true
  const requireGraduatedStatus  = policy.requireGraduatedStatus ?? true

  if (!student) {
    return { eligible: false, reasons: ['Student record not found.'] }
  }
  if (requireGraduationRecord && !graduationRecord) {
    reasons.push('No graduation record exists for this student.')
  }
  if (requireGraduatedStatus && student.lifecycle_stage !== 'graduated') {
    reasons.push('Student is not marked as graduated.')
  }
  if (graduationRecord && graduationRecord.student_id !== student.id) {
    reasons.push('Graduation record does not belong to this student.')
  }
  if (graduationRecord && graduationRecord.school_id !== student.school_id) {
    reasons.push('Graduation record belongs to a different school.')
  }
  if (existingCertificate && existingCertificate.status !== 'revoked') {
    reasons.push(`An active certificate already exists for this student (status: ${existingCertificate.status}). Revoke it before issuing a replacement.`)
  }

  return { eligible: reasons.length === 0, reasons }
}
