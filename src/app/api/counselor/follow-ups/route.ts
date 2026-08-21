// src/app/api/counselor/follow-ups/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAppointment } from '@/lib/permissions'

// GET, every pending/overdue follow-up across the counselor's own
// caseload, for the dashboard overview widget. Case-scoped follow-ups are
// also readable from the case detail route; this is the flattened,
// cross-case view.
export async function GET(request: Request) {
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const status = searchParams.get('status') ?? 'pending'

  const { data, error } = await supabase
    .from('counseling_follow_ups')
    .select(`
      id, due_at, note, status, case_id,
      case:counseling_cases!inner ( id, student:profiles!counseling_cases_student_profile_id_fkey ( id, full_name ) )
    `)
    .eq('counselor_profile_id', caller.userId)
    .eq('status', status)
    .order('due_at', { ascending: true })
    .limit(100)

  if (error) {
    return NextResponse.json({ error: 'Could not load follow-ups right now.' }, { status: 500 })
  }

  return NextResponse.json({ followUps: data ?? [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller || !caller.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { caseId, dueAt, note } = await request.json()
  if (!caseId || !dueAt || !note?.trim()) {
    return NextResponse.json({ error: 'Case, due date, and note are required.' }, { status: 400 })
  }

  const { data: caseRow } = await supabase
    .from('counseling_cases')
    .select('id')
    .eq('id', caseId)
    .eq('counselor_profile_id', caller.userId)
    .maybeSingle()

  if (!caseRow) {
    return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
  }

  const { data: created, error } = await supabase
    .from('counseling_follow_ups')
    .insert({
      case_id: caseId,
      school_id: caller.schoolId,
      counselor_profile_id: caller.userId,
      due_at: new Date(dueAt).toISOString(),
      note: note.trim(),
    })
    .select('id, due_at, note, status')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Could not create the follow-up. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ followUp: created })
}
