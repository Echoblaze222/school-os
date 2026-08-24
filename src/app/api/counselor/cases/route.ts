// src/app/api/counselor/cases/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAppointment } from '@/lib/permissions'

// GET, the calling counselor's own caseload only. RLS on
// counseling_cases already restricts rows to counselor_profile_id =
// auth.uid(), so this query would return the same result even without the
// requireAppointment() gate below, the gate exists to fail with a clear
// 403 instead of a confusing empty list when someone without an active
// counselor appointment hits this route directly.
export async function GET(request: Request) {
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') // 'open' | 'monitoring' | 'closed' | null (= open+monitoring)

  let query = supabase
    .from('counseling_cases')
    .select(`
      id, category, risk_level, status, summary, opened_at, closed_at,
      student:profiles!counseling_cases_student_profile_id_fkey ( id, full_name, class_level )
    `)
    .eq('counselor_profile_id', caller.userId)
    .order('opened_at', { ascending: false })
    .limit(200) // §33 performance: caseload accumulates indefinitely

  query = status ? query.eq('status', status) : query.in('status', ['open', 'monitoring'])

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: 'Could not load caseload right now. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ cases: data ?? [] })
}

// POST, open a new case directly (counselor-initiated, not via referral).
export async function POST(request: Request) {
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller || !caller.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { studentId, category, riskLevel, summary } = await request.json()
  if (!studentId) {
    return NextResponse.json({ error: 'A student must be selected.' }, { status: 400 })
  }

  // The student must belong to the same school, never trust the client id
  // alone.
  const { data: student } = await supabase
    .from('profiles')
    .select('id, school_id, role')
    .eq('id', studentId)
    .eq('school_id', caller.schoolId)
    .eq('role', 'student')
    .maybeSingle()

  if (!student) {
    return NextResponse.json({ error: 'Student not found at this school.' }, { status: 404 })
  }

  const { data: created, error } = await supabase
    .from('counseling_cases')
    .insert({
      school_id: caller.schoolId,
      student_profile_id: studentId,
      counselor_profile_id: caller.userId,
      category: category ?? 'general',
      risk_level: riskLevel ?? 'low',
      summary: summary?.trim() || null,
      opened_by: caller.userId,
    })
    .select('id')
    .single()

  if (error) {
    // The partial unique index rejects a second open/monitoring case for
    // the same student, surface that as a clear message, not a raw DB error.
    if (error.code === '23505') {
      return NextResponse.json(
        { error: 'This student already has an open counseling case.' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: 'Could not create the case. Please try again.' }, { status: 500 })
  }

  try {
    const admin = createAdminClient()
    await admin.from('portal_audit_log').insert({
      action: 'counseling_case_opened',
      actor_id: caller.userId,
      target_table: 'counseling_cases',
      target_id: created.id,
      metadata: { school_id: caller.schoolId },
      logged_at: new Date().toISOString(),
    })
  } catch { /* non-critical */ }

  return NextResponse.json({ id: created.id })
}
