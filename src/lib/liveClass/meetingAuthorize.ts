// src/lib/liveClass/meetingAuthorize.ts
//
// Authorization for embedding LiveKit into the EXISTING `online_meetings`
// feature (Phase 4) — NOT a new table. SchoolOS already has a full
// meetings scheduler across six roles (principal creates; teacher/
// parent/student/bursar/secretary each see a filtered list), using
// target_audience ('all_parents' | 'all_teachers' | 'all_staff' |
// 'specific_class') + target_class_id, and joining today via an external
// meeting_url link. This module is the server-side authorization for the
// new LiveKit join path, mirroring the audience rules the app's existing
// per-role page.tsx queries already encode (and which the Phase 4 SQL
// migration now also enforces via RLS, as a backstop under this).
//
// Structured like authorize.ts (pure decision function + loaders, same
// cross-school-before-anything-else ordering) but kept as a SEPARATE
// module for the same reason as before: a class's authorization shape
// (one teacher, one enrolled-student check) and a meeting's (an audience
// determined by target_audience) are different enough that combining
// them risks each domain's future changes breaking the other.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { LiveClassRole } from './authorize'

export type MeetingAudience = 'all_parents' | 'all_teachers' | 'all_staff' | 'specific_class'

export type MeetingAuthorizeDenyReason =
  | 'not_authenticated'
  | 'no_profile'
  | 'school_locked'
  | 'meeting_not_found'
  | 'cross_school'
  | 'not_authorized_audience'

export type MeetingAuthorizeResult =
  | { ok: true; role: LiveClassRole; userId: string; schoolId: string; meetingId: string }
  | { ok: false; reason: MeetingAuthorizeDenyReason }

/** Same shape as authorize.ts's isDenied — see that file's doc comment: this project's tsconfig (strict:false) doesn't reliably narrow discriminated unions the plain way, confirmed against the real compiler. */
export function isMeetingDenied(result: MeetingAuthorizeResult): result is Extract<MeetingAuthorizeResult, { ok: false }> {
  return result.ok === false
}

export interface MeetingCallerProfile {
  userId: string
  role: string
  schoolId: string | null
  fullName: string | null
}

export interface OnlineMeetingRow {
  id: string
  school_id: string
  target_audience: MeetingAudience
  target_class_id: string | null
  created_by: string
}

/**
 * Pure decision function — no I/O. `is_staff()` roles always get host
 * (principal/bursar/secretary/admin — matches the existing is_staff()
 * SQL helper from Phase 0). The meeting's creator gets host too, even if
 * not otherwise staff (today only principal creates meetings via the
 * existing UI, but the RLS INSERT policy — and this — don't hard-code
 * that; see the Phase 4 migration's own comment on this). Everyone else
 * is evaluated as a participant against target_audience/target_class_id,
 * using isInMeetingAudience (below) — which needs a class/parent-link
 * lookup this pure function can't do itself, so that check is
 * precomputed by the caller (see loadIsInSpecificClassAudience) and
 * passed in.
 */
export function decideMeetingAccess(params: {
  caller: MeetingCallerProfile
  meeting: OnlineMeetingRow | null
  isInSpecificClassAudience: boolean
  schoolLock: { locked: boolean }
}): MeetingAuthorizeResult {
  const { caller, meeting, isInSpecificClassAudience, schoolLock } = params

  if (!caller.schoolId) return { ok: false, reason: 'no_profile' }
  if (!meeting) return { ok: false, reason: 'meeting_not_found' }
  if (meeting.school_id !== caller.schoolId) return { ok: false, reason: 'cross_school' }
  if (schoolLock.locked) return { ok: false, reason: 'school_locked' }

  const staffRoles = ['principal', 'bursar', 'secretary', 'admin']
  const isStaff = staffRoles.includes(caller.role)
  const isCreator = meeting.created_by === caller.userId

  if (isStaff || isCreator) {
    return { ok: true, role: 'host', userId: caller.userId, schoolId: caller.schoolId, meetingId: meeting.id }
  }

  const inAudience = isInMeetingAudience({
    role: caller.role,
    targetAudience: meeting.target_audience,
    isInSpecificClassAudience,
  })

  if (inAudience) {
    return { ok: true, role: 'participant', userId: caller.userId, schoolId: caller.schoolId, meetingId: meeting.id }
  }

  return { ok: false, reason: 'not_authorized_audience' }
}

/**
 * Matches the audience filtering each role's existing meetings page.tsx
 * already does client-query-side (verified against the real query in
 * each of those files, not guessed): 'all_staff' includes teachers, not
 * just the narrower is_staff() set — confirmed from the teacher meetings
 * page, which queries `.in('target_audience', ['all_teachers',
 * 'all_staff'])`. 'specific_class' membership (student in the class, or
 * parent of a student in the class) is precomputed by the caller and
 * passed in as isInSpecificClassAudience, since it needs a DB lookup
 * this pure function can't do.
 */
export function isInMeetingAudience(params: {
  role: string
  targetAudience: MeetingAudience
  isInSpecificClassAudience: boolean
}): boolean {
  const { role, targetAudience, isInSpecificClassAudience } = params
  switch (targetAudience) {
    case 'all_parents': return role === 'parent'
    case 'all_teachers': return role === 'teacher'
    case 'all_staff': return ['teacher', 'principal', 'bursar', 'secretary', 'admin'].includes(role)
    case 'specific_class': return (role === 'student' || role === 'parent') && isInSpecificClassAudience
    default: return false
  }
}

export async function loadMeetingCallerProfile(supabase: SupabaseClient, userId: string): Promise<MeetingCallerProfile | null> {
  const { data: profile } = await supabase.from('profiles').select('role, school_id, full_name').eq('id', userId).single()
  if (!profile) return null
  return {
    userId,
    role: (profile as any).role,
    schoolId: (profile as any).school_id ?? null,
    fullName: (profile as any).full_name ?? null,
  }
}

export async function loadOnlineMeeting(supabase: SupabaseClient, meetingId: string): Promise<OnlineMeetingRow | null> {
  const { data } = await supabase
    .from('online_meetings')
    .select('id, school_id, target_audience, target_class_id, created_by')
    .eq('id', meetingId)
    .maybeSingle()
  return (data as OnlineMeetingRow) ?? null
}

/**
 * Resolves whether THIS caller (student or parent) is in the audience
 * for a 'specific_class' meeting — student directly via
 * student_profiles.class_id, parent via profiles.parent_id -> their
 * child's student_profiles.class_id (same link the existing parent
 * meetings page.tsx already uses). Only meaningful (and only called) when
 * meeting.target_audience === 'specific_class'; returns false for any
 * other audience type without doing a lookup.
 */
export async function loadIsInSpecificClassAudience(
  supabase: SupabaseClient,
  caller: MeetingCallerProfile,
  meeting: OnlineMeetingRow | null
): Promise<boolean> {
  if (!meeting || meeting.target_audience !== 'specific_class' || !meeting.target_class_id) return false

  if (caller.role === 'student') {
    const { data } = await supabase
      .from('student_profiles')
      .select('id')
      .eq('id', caller.userId)
      .eq('class_id', meeting.target_class_id)
      .maybeSingle()
    return !!data
  }

  if (caller.role === 'parent') {
    const { data } = await supabase
      .from('student_profiles')
      .select('id, profiles!inner(parent_id)')
      .eq('class_id', meeting.target_class_id)
      .eq('profiles.parent_id', caller.userId)
      .maybeSingle()
    return !!data
  }

  return false
}
