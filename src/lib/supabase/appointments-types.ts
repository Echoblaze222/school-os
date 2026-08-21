// lib/supabase/appointments-types.ts
// -------------------------------------------------------
// Phase 1 addition. Does not replace UserRole in types.ts: a profile's
// base role stays one of the existing 6 structural roles. This file adds
// the appointment layer on top, matching what create-user/staff-codes
// routes already promise in practice (see audit §2: 'librarian' and
// 'nurse' are already accepted there but were never added to UserRole,
// which is a live bug this file closes).
// -------------------------------------------------------

import type { UserRole } from './types'

// If you decide librarian/nurse/counselor should be first-class base
// roles rather than appointments layered on 'teacher', add them here and
// to UserRole + ROLE_DASHBOARDS in types.ts together, in the same change :
// never one without the other, that's exactly how the current mismatch
// happened.
export type AppointmentTypeId =
  | 'vice_principal'
  | 'hod'
  | 'examination_officer'
  | 'examination_coordinator'
  | 'examination_secretary'
  | 'exam_setter'
  | 'invigilator'
  | 'result_officer'
  | 'result_verification_officer'
  | 'counselor'
  | 'nurse'
  | 'librarian'
  | 'ict_officer'
  | 'ict_administrator'
  | 'warden'
  | 'assistant_warden'
  | 'house_parent'
  | 'hostel_administrator'
  | 'coach'
  | 'head_boy'
  | 'head_girl'
  | 'class_prefect'
  | 'hostel_prefect'

export type AppointmentCategory =
  | 'academic'
  | 'welfare'
  | 'operations'
  | 'ict'
  | 'hostel'
  | 'student_leadership'

export interface AppointmentTypeConfig {
  id: AppointmentTypeId
  label: string
  category: AppointmentCategory
  baseRoleScope: UserRole[]
}

// The examination committee, Lane C (Phase 2). A school configures
// whichever of these positions it actually uses; holding one doesn't
// imply any of the others. See examPermissions.ts for what each can do.
export const EXAM_APPOINTMENT_TYPES: AppointmentTypeId[] = [
  'examination_officer',
  'examination_coordinator',
  'examination_secretary',
  'exam_setter',
  'invigilator',
  'result_officer',
  'result_verification_officer',
]

// Mirrors the `appointment_types` seed rows in
// 02-identity-appointments-schema.sql. Keep these in sync manually until
// there's a shared codegen step: same discipline as the comment at the
// top of types.ts already asks for.
export const APPOINTMENT_TYPES: Record<AppointmentTypeId, AppointmentTypeConfig> = {
  vice_principal:      { id: 'vice_principal',      label: 'Vice Principal',      category: 'academic',           baseRoleScope: ['teacher', 'principal'] },
  hod:                  { id: 'hod',                  label: 'Head of Department',  category: 'academic',           baseRoleScope: ['teacher'] },
  examination_officer:  { id: 'examination_officer',  label: 'Examination Officer', category: 'academic',           baseRoleScope: ['teacher'] },
  examination_coordinator: { id: 'examination_coordinator', label: 'Examination Coordinator', category: 'academic', baseRoleScope: ['teacher'] },
  examination_secretary:   { id: 'examination_secretary',   label: 'Examination Secretary',   category: 'academic', baseRoleScope: ['teacher'] },
  exam_setter:              { id: 'exam_setter',              label: 'Exam Setter',             category: 'academic', baseRoleScope: ['teacher'] },
  invigilator:                { id: 'invigilator',                label: 'Invigilator',             category: 'academic', baseRoleScope: ['teacher'] },
  result_officer:              { id: 'result_officer',              label: 'Result Officer',          category: 'academic', baseRoleScope: ['teacher'] },
  result_verification_officer:  { id: 'result_verification_officer',  label: 'Result Verification Officer', category: 'academic', baseRoleScope: ['teacher'] },
  counselor:             { id: 'counselor',             label: 'Counselor',           category: 'welfare',            baseRoleScope: ['teacher'] },
  nurse:                 { id: 'nurse',                 label: 'School Nurse',        category: 'welfare',            baseRoleScope: ['teacher'] },
  librarian:             { id: 'librarian',             label: 'Librarian',           category: 'operations',         baseRoleScope: ['teacher'] },
  ict_officer:            { id: 'ict_officer',            label: 'ICT Officer',         category: 'ict',                baseRoleScope: ['teacher'] },
  ict_administrator:       { id: 'ict_administrator',       label: 'ICT Administrator',   category: 'ict',                baseRoleScope: ['teacher', 'principal'] },
  warden:                 { id: 'warden',                 label: 'Hostel Warden',       category: 'hostel',             baseRoleScope: ['teacher'] },
  assistant_warden:        { id: 'assistant_warden',        label: 'Assistant Warden',    category: 'hostel',             baseRoleScope: ['teacher'] },
  house_parent:             { id: 'house_parent',             label: 'House Parent',        category: 'hostel',             baseRoleScope: ['teacher'] },
  hostel_administrator:      { id: 'hostel_administrator',      label: 'Hostel Administrator', category: 'hostel',           baseRoleScope: ['teacher', 'principal'] },
  coach:                   { id: 'coach',                   label: 'Sports Coach',        category: 'operations',         baseRoleScope: ['teacher'] },
  head_boy:                 { id: 'head_boy',                 label: 'Head Boy',            category: 'student_leadership', baseRoleScope: ['student'] },
  head_girl:                 { id: 'head_girl',                 label: 'Head Girl',           category: 'student_leadership', baseRoleScope: ['student'] },
  class_prefect:               { id: 'class_prefect',               label: 'Class Prefect',       category: 'student_leadership', baseRoleScope: ['student'] },
  hostel_prefect:                { id: 'hostel_prefect',                label: 'Hostel Prefect',      category: 'student_leadership', baseRoleScope: ['student'] },
}

export interface Appointment {
  id: string
  school_id: string
  profile_id: string
  appointment_type: AppointmentTypeId
  department_id: string | null
  reports_to_profile_id: string | null
  scope: Record<string, unknown>
  status: 'active' | 'revoked' | 'expired'
  assigned_by: string | null
  assigned_at: string
  revoked_at: string | null
  revoked_by: string | null
}

// Nine-verb action set from the §25 permission matrix. Shared type so
// every route's permission check reads from the same vocabulary instead
// of inventing its own strings.
export type PermissionAction =
  | 'view' | 'create' | 'edit' | 'approve' | 'publish'
  | 'assign' | 'export' | 'delete' | 'manage'
