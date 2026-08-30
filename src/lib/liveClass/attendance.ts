// src/lib/liveClass/attendance.ts
//
// Marks a student present in the EXISTING `attendance` table (class_id,
// student_id, date, is_present, status, marked_by, teacher_id, school_id)
// rather than introducing a second, live-class-specific attendance
// system. `live_session_participants` (Phase 0) remains the detailed
// join/leave/duration audit trail; this is the one-line-per-student-per-
// day summary the rest of SchoolOS already reads everywhere else
// (report cards, attendance registers, etc).
//
// Idempotency note: `attendance` has no unique constraint on
// (class_id, student_id, date) in the existing schema (confirmed by
// inspecting sql/s.sql — this predates live classes entirely). Adding one
// blindly in a migration risks failing against production data that may
// already contain duplicates from the existing manual-attendance flows,
// so this deliberately does NOT add one. Instead, idempotency is achieved
// in application logic: select-then-insert-or-update, so a student who
// reconnects (a second, genuinely distinct participant_joined webhook
// event — already-delivered duplicates of the SAME event are handled
// upstream by withIdempotency in the webhook route) still results in
// exactly one attendance row for that class/student/day, not two.
//
// This has a narrow theoretical race window (two participant_joined
// events for the same student arriving concurrently could both pass the
// "not found" check before either insert completes) — acceptable for
// Phase 1 given how rarely that's possible in practice (LiveKit doesn't
// fire duplicate joins for a single connection), but worth knowing about;
// flagged again in the Phase 1 summary rather than silently assumed
// solved.

import type { SupabaseClient } from '@supabase/supabase-js'

function todayDateString(): string {
  // date-only, matching attendance.date's `date` column type
  return new Date().toISOString().slice(0, 10)
}

/**
 * Marks a student present for a class today, based on them joining a
 * live session for it. Safe to call more than once for the same
 * student/class/day — later calls are no-ops once is_present is already
 * true (still returns success, doesn't error or duplicate).
 */
export async function markLiveClassAttendance(
  admin: SupabaseClient,
  params: { schoolId: string; classId: string; studentId: string; teacherId: string | null }
): Promise<{ action: 'inserted' | 'updated' | 'already_present' | 'skipped'; error?: string }> {
  const { schoolId, classId, studentId, teacherId } = params
  const date = todayDateString()

  const { data: existing, error: selectErr } = await admin
    .from('attendance')
    .select('id, is_present')
    .eq('class_id', classId)
    .eq('student_id', studentId)
    .eq('date', date)
    .maybeSingle()

  if (selectErr) return { action: 'skipped', error: selectErr.message }

  if (existing) {
    if (existing.is_present) return { action: 'already_present' }
    const { error: updateErr } = await admin
      .from('attendance')
      .update({ is_present: true, status: 'present', notes: 'Marked present via live class join' })
      .eq('id', existing.id)
    return updateErr ? { action: 'skipped', error: updateErr.message } : { action: 'updated' }
  }

  const { error: insertErr } = await admin.from('attendance').insert({
    class_id: classId,
    student_id: studentId,
    school_id: schoolId,
    teacher_id: teacherId,
    date,
    is_present: true,
    status: 'present',
    marked_by: teacherId, // attributed to the class's teacher, consistent with how manual attendance is recorded elsewhere — not the system/service account
    notes: 'Marked present via live class join',
  })
  return insertErr ? { action: 'skipped', error: insertErr.message } : { action: 'inserted' }
}
