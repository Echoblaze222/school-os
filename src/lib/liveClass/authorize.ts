// src/lib/liveClass/authorize.ts
//
// Server-side authorization for the live classroom system. This is the
// actual tenant/security boundary described in the Phase 0 architecture
// doc: LiveKit itself has no concept of "school" or "class" — it only
// trusts whatever token it's handed. Every check here runs BEFORE a token
// is minted, using the same RLS-equivalent pattern as getExamContext.ts
// and permissions.ts (never trusting a client-supplied role/school, always
// re-deriving it from the database for the authenticated session).
//
// Deliberately written as pure-ish functions taking a SupabaseClient and
// plain args (not reading cookies/redirecting itself) so they're testable
// in isolation without a request context — see
// src/lib/liveClass/__tests__/authorize.test.ts.

import type { SupabaseClient } from '@supabase/supabase-js'

export type LiveClassRole = 'host' | 'participant'

export type AuthorizeDenyReason =
  | 'not_authenticated'
  | 'no_profile'
  | 'school_locked'
  | 'session_not_found'
  | 'cross_school'
  | 'not_enrolled_in_class'
  | 'not_authorized_role'
// Note: a teacher not assigned to this specific class is NOT a deny case —
// they fall through to the participant branch below (least-privilege,
// audio-only join within their own school), same as a parent or other
// staff. Only principal/assigned-teacher get 'host'. A STUDENT not
// enrolled in this specific class IS a deny case (not_enrolled_in_class)
// — same-school alone isn't enough for a student to join an unrelated
// class's session, per the Phase 1 test requirement distinguishing
// "unrelated class, same school" from "different school entirely" as two
// separate scenarios. If a future requirement needs unassigned teachers
// blocked entirely too, add a reason here AND a branch above returning
// it — don't reintroduce an unused reason value.

export type AuthorizeResult =
  | { ok: true; role: LiveClassRole; userId: string; schoolId: string; onlineClassId: string; classId: string }
  | { ok: false; reason: AuthorizeDenyReason }

/**
 * Explicit type-guard for the deny branch of AuthorizeResult. Exists
 * because this repo's tsconfig has `strict: false`, and TypeScript's
 * control-flow narrowing for discriminated unions (e.g. `if (!decision.ok)
 * decision.reason`) depends on strictNullChecks — without it, that
 * ordinary-looking pattern silently fails to narrow and `next build`'s
 * type-check step fails with "Property 'reason' does not exist" even
 * though the logic is correct at runtime. A named type predicate narrows
 * reliably regardless of strict mode. Verified against the real
 * TypeScript compiler with this project's exact tsconfig settings before
 * relying on it here — see the build failure this was introduced to fix.
 * Always use this (or an equivalent `result.ok === false` check assigned
 * to its own guarded variable) instead of `!result.ok` at any call site
 * that then reads `.reason`.
 */
export function isDenied(result: AuthorizeResult): result is Extract<AuthorizeResult, { ok: false }> {
  return result.ok === false
}

export interface CallerProfile {
  userId: string
  role: string
  schoolId: string | null
  fullName: string | null
}

export interface OnlineClassRow {
  id: string
  class_id: string
  school_id: string
  teacher_id: string | null
}

export interface SchoolLockState {
  locked: boolean
}

/**
 * Pure decision function: given a caller's profile, the target session row,
 * whether the caller is the assigned class_teacher, and the school's lock
 * state, decide whether — and in what role — they may receive a LiveKit
 * token. No I/O here; callers (loadCallerProfile / loadOnlineClass below,
 * or the route handler) are responsible for fetching real data. Kept
 * separate specifically so this decision logic can be unit-tested without
 * a database.
 */
export function decideLiveClassAccess(params: {
  caller: CallerProfile
  session: OnlineClassRow | null
  isClassTeacher: boolean
  isEnrolledStudent: boolean
  schoolLock: SchoolLockState
}): AuthorizeResult {
  const { caller, session, isClassTeacher, isEnrolledStudent, schoolLock } = params

  if (!caller.schoolId) return { ok: false, reason: 'no_profile' }
  if (!session) return { ok: false, reason: 'session_not_found' }

  // Tenant boundary: this must be checked before anything else that
  // depends on role, so a cross-school caller is rejected the same way
  // regardless of what role they hold.
  if (session.school_id !== caller.schoolId) return { ok: false, reason: 'cross_school' }

  // A locked school (hard-locked or billing-locked, same definition as
  // checkSubscription() in lib/subscription.ts) cannot create or join new
  // live sessions, mirroring the same rule the rest of the app already
  // enforces for dashboards.
  if (schoolLock.locked) return { ok: false, reason: 'school_locked' }

  const isPrincipal = caller.role === 'principal'
  const isAssignedTeacher = caller.role === 'teacher' && isClassTeacher

  if (isAssignedTeacher || isPrincipal) {
    return {
      ok: true,
      role: 'host',
      userId: caller.userId,
      schoolId: caller.schoolId,
      onlineClassId: session.id,
      classId: session.class_id,
    }
  }

  // Any other same-school, non-locked caller (student, parent, other
  // staff) joins as a participant — least-privilege token, publish
  // permissions granted at the token layer are NONE by default (see
  // livekit.ts), not decided here. A STUDENT additionally needs to
  // actually be enrolled in THIS class — same-school alone isn't enough
  // (a student from Grade 3 has no business joining Grade 10's session
  // just because it's the same school). Parents/other staff aren't
  // subject to this narrower check in Phase 1 — they're treated as
  // building-wide observers, same as before; tightening that further is
  // a product decision for a later phase, not a security gap today.
  const participantRoles = ['student', 'parent', 'teacher', 'bursar', 'secretary']
  if (caller.role === 'student' && !isEnrolledStudent) {
    return { ok: false, reason: 'not_enrolled_in_class' }
  }
  if (participantRoles.includes(caller.role)) {
    return {
      ok: true,
      role: 'participant',
      userId: caller.userId,
      schoolId: caller.schoolId,
      onlineClassId: session.id,
      classId: session.class_id,
    }
  }

  return { ok: false, reason: 'not_authorized_role' }
}

/** Loads the caller's profile the same way permissions.ts's getCallerContext does, plus full_name for the token's display name. */
export async function loadCallerProfile(supabase: SupabaseClient, userId: string): Promise<CallerProfile | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id, full_name')
    .eq('id', userId)
    .single()

  if (!profile) return null
  return {
    userId,
    role: (profile as any).role,
    schoolId: (profile as any).school_id ?? null,
    fullName: (profile as any).full_name ?? null,
  }
}

/** Loads the target online_classes row. RLS still applies underneath this (defense in depth), so a cross-school row simply won't come back as a mismatch is caught explicitly in decideLiveClassAccess rather than relied upon implicitly. */
export async function loadOnlineClass(supabase: SupabaseClient, onlineClassId: string): Promise<OnlineClassRow | null> {
  const { data } = await supabase
    .from('online_classes')
    .select('id, class_id, school_id, teacher_id')
    .eq('id', onlineClassId)
    .maybeSingle()

  return (data as OnlineClassRow) ?? null
}

/** Mirrors the is_class_teacher() SQL helper added in the Phase 0 migration, for use from the admin client (service role), which bypasses RLS and so cannot call the SQL function's auth.uid()-based version directly. */
export async function isAssignedClassTeacher(
  supabase: SupabaseClient,
  teacherId: string,
  classId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('class_teachers')
    .select('id')
    .eq('teacher_id', teacherId)
    .eq('class_id', classId)
    .limit(1)
    .maybeSingle()

  return !!data
}

/** Mirrors is_class_teacher(): is this student actually enrolled in the target class? Checked via student_profiles.class_id (each student has exactly one class in this schema), not just "same school". */
export async function isEnrolledInClass(
  supabase: SupabaseClient,
  studentId: string,
  classId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('student_profiles')
    .select('id')
    .eq('id', studentId)
    .eq('class_id', classId)
    .maybeSingle()

  return !!data
}
