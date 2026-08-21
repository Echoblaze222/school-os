// lib/supabase/examPermissions.ts
// -------------------------------------------------------
// Phase 2, Lane C. Capability table for the examination committee.
//
// This is the readable/TypeScript mirror of the appointment_type
// allow-lists baked into lane-c-examination-schema.sql's RLS policies.
// The two are NOT auto-generated from each other — if you add a
// capability here, add the matching check in the SQL file too, and vice
// versa. This file is what API routes use for their own server-side
// check (never trust the client, per the phase doc); the SQL policies
// are the floor underneath direct client+RLS calls. Both must agree or
// you get a UI that shows a button an API route then rejects (annoying
// but safe) or, worse, a route that's looser than the RLS floor
// (a bug — RLS would still catch it, but fix the drift anyway).
//
// Per the source spec §6: "Do not allow one examination team member to
// automatically access every examination function. Use granular
// permissions." Every capability below is scoped to the specific
// positions the spec's own worked example assigns it to.
// -------------------------------------------------------

import type { AppointmentTypeId } from './appointments-types'
import type { UserRole } from './types'

export type ExamCapability =
  | 'manage_exams'        // create/edit sessions, timetable, rooms
  | 'assign_invigilators'
  | 'manage_seating'
  | 'mark_own_attendance' // invigilator marking their assigned sitting only — checked against invigilator_assignments, not this table alone
  | 'create_documents'    // question-paper/marking-scheme drafting
  | 'review_documents'    // move a document through submitted → approved
  | 'enter_results'       // administrative result entry (result_officer)
  | 'verify_results'
  | 'approve_results'     // existing `approved` flag — HOD/VP/Principal territory, listed here for completeness
  | 'publish_results'
  | 'export_results'
  | 'report_incident'     // baseline — any exam-team appointment, or any staff role present at a sitting
  | 'resolve_incident'
  | 'view_committee_dashboard'

// Principal always has every capability (school-wide default scope per
// the §25 matrix header note) — checked separately in hasExamCapability,
// not duplicated into every row below.
const CAPABILITY_APPOINTMENTS: Record<ExamCapability, AppointmentTypeId[]> = {
  manage_exams:            ['examination_officer', 'examination_coordinator'],
  assign_invigilators:     ['examination_officer', 'examination_coordinator'],
  manage_seating:          ['examination_officer', 'examination_coordinator'],
  mark_own_attendance:     ['invigilator', 'examination_officer', 'examination_coordinator'],
  create_documents:        ['exam_setter', 'examination_officer', 'examination_coordinator'],
  review_documents:        ['examination_officer', 'examination_coordinator'],
  enter_results:           ['result_officer', 'examination_officer'],
  verify_results:          ['result_verification_officer', 'examination_officer'],
  approve_results:         ['examination_officer'], // + principal, + whatever VP/HOD Lane A ships — this file only owns the exam-committee side
  publish_results:         ['examination_officer'],
  export_results:          ['examination_officer', 'examination_coordinator', 'result_officer'],
  report_incident:         ['examination_officer', 'examination_coordinator', 'examination_secretary', 'exam_setter', 'invigilator', 'result_officer', 'result_verification_officer'],
  resolve_incident:        ['examination_officer', 'examination_coordinator'],
  view_committee_dashboard: ['examination_officer', 'examination_coordinator', 'examination_secretary', 'exam_setter', 'invigilator', 'result_officer', 'result_verification_officer'],
}

export interface ActiveAppointment {
  appointment_type: AppointmentTypeId
  status: 'active' | 'revoked' | 'expired'
}

/**
 * Server-side capability check. `role` and `appointments` must come from
 * a query the caller already ran against the authenticated user's own
 * session (service-role or RLS-scoped) — this function does no fetching
 * itself, so it can't be the accidental source of a stale/forged check.
 */
export function hasExamCapability(
  capability: ExamCapability,
  role: UserRole | string | null | undefined,
  appointments: ActiveAppointment[] | null | undefined,
): boolean {
  if (role === 'principal') return true
  const active = (appointments ?? [])
    .filter(a => a.status === 'active')
    .map(a => a.appointment_type)
  const allowed = CAPABILITY_APPOINTMENTS[capability]
  return active.some(t => allowed.includes(t))
}

/** True if the profile holds ANY active examination-committee appointment. */
export function isOnExamCommittee(appointments: ActiveAppointment[] | null | undefined): boolean {
  const EXAM_TYPES: AppointmentTypeId[] = [
    'examination_officer', 'examination_coordinator', 'examination_secretary',
    'exam_setter', 'invigilator', 'result_officer', 'result_verification_officer',
  ]
  return (appointments ?? []).some(a => a.status === 'active' && EXAM_TYPES.includes(a.appointment_type))
}
