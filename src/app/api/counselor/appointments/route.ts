// src/app/api/counselor/appointments/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAppointment } from '@/lib/permissions'
import { notifyUser } from '@/lib/notify/notifyUser'

export async function GET(request: Request) {
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const scope = searchParams.get('scope') ?? 'upcoming' // 'upcoming' | 'past'

  let query = supabase
    .from('counseling_sessions')
    .select(`
      id, scheduled_at, duration_minutes, location, status, session_summary, case_id,
      student:profiles!counseling_sessions_student_profile_id_fkey ( id, full_name, class_level )
    `)
    .eq('counselor_profile_id', caller.userId)

  query = scope === 'past'
    ? query.lt('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: false })
    : query.gte('scheduled_at', new Date().toISOString()).order('scheduled_at', { ascending: true })

  const { data, error } = await query.limit(100)
  if (error) {
    return NextResponse.json({ error: 'Could not load appointments right now.' }, { status: 500 })
  }

  return NextResponse.json({ sessions: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller || !caller.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { studentId, caseId, scheduledAt, durationMinutes, location } = await request.json()
  if (!studentId || !scheduledAt) {
    return NextResponse.json({ error: 'A student and a scheduled time are required.' }, { status: 400 })
  }

  const scheduledDate = new Date(scheduledAt)
  if (Number.isNaN(scheduledDate.getTime())) {
    return NextResponse.json({ error: 'Invalid scheduled time.' }, { status: 400 })
  }

  const { data: student } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('id', studentId)
    .eq('school_id', caller.schoolId)
    .eq('role', 'student')
    .maybeSingle()

  if (!student) {
    return NextResponse.json({ error: 'Student not found at this school.' }, { status: 404 })
  }

  // If a case is given, confirm it belongs to this counselor before linking.
  if (caseId) {
    const { data: caseRow } = await supabase
      .from('counseling_cases')
      .select('id')
      .eq('id', caseId)
      .eq('counselor_profile_id', caller.userId)
      .maybeSingle()
    if (!caseRow) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
    }
  }

  const { data: created, error } = await supabase
    .from('counseling_sessions')
    .insert({
      school_id: caller.schoolId,
      case_id: caseId ?? null,
      counselor_profile_id: caller.userId,
      student_profile_id: studentId,
      scheduled_at: scheduledDate.toISOString(),
      duration_minutes: durationMinutes && durationMinutes > 0 ? durationMinutes : 30,
      location: location?.trim() || null,
    })
    .select('id, scheduled_at, duration_minutes, location, status')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Could not schedule the appointment. Please try again.' }, { status: 500 })
  }

  // Notify the student a counseling appointment was scheduled. Generic
  // wording only, per §27: never put the reason or case details in a
  // notification body that could show on a lock screen.
  try {
    await notifyUser({
      recipientId: studentId,
      schoolId: caller.schoolId,
      title: 'Counseling appointment scheduled',
      body: `You have a counseling appointment on ${scheduledDate.toLocaleDateString('en-NG', { dateStyle: 'medium' })} at ${scheduledDate.toLocaleTimeString('en-NG', { timeStyle: 'short' })}.`,
      type: 'counseling_appointment',
      linkUrl: '/dashboard/student',
      referenceId: created.id,
      referenceTable: 'counseling_sessions',
    })
  } catch { /* notification delivery is best-effort, never blocks scheduling */ }

  return NextResponse.json({ session: created })
}
