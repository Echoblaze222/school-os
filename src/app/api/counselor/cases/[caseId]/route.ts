// src/app/api/counselor/cases/[caseId]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAppointment } from '@/lib/permissions'

export async function GET(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // RLS already restricts this to counseling_cases.counselor_profile_id =
  // auth.uid(); the explicit .eq() below just makes the ownership scoping
  // visible in this file rather than relying on RLS silently returning
  // "not found" for a case that belongs to someone else.
  const { data: caseRow, error } = await supabase
    .from('counseling_cases')
    .select(`
      id, category, risk_level, status, summary, opened_at, closed_at, closed_reason,
      student:profiles!counseling_cases_student_profile_id_fkey ( id, full_name, class_level )
    `)
    .eq('id', caseId)
    .eq('counselor_profile_id', caller.userId)
    .maybeSingle()

  if (error || !caseRow) {
    return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
  }

  const [{ data: notes }, { data: followUps }, { data: sessions }] = await Promise.all([
    supabase.from('counseling_notes')
      .select('id, note, created_at')
      .eq('case_id', caseId)
      .order('created_at', { ascending: false }),
    supabase.from('counseling_follow_ups')
      .select('id, due_at, note, status, completed_at')
      .eq('case_id', caseId)
      .order('due_at', { ascending: true }),
    supabase.from('counseling_sessions')
      .select('id, scheduled_at, duration_minutes, location, status, session_summary')
      .eq('case_id', caseId)
      .order('scheduled_at', { ascending: false }),
  ])

  return NextResponse.json({
    case: caseRow,
    notes: notes ?? [],
    followUps: followUps ?? [],
    sessions: sessions ?? [],
  })
}

export async function PATCH(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status && ['open', 'monitoring', 'closed'].includes(body.status)) {
    update.status = body.status
    if (body.status === 'closed') {
      update.closed_at = new Date().toISOString()
      update.closed_reason = typeof body.closedReason === 'string' ? body.closedReason.trim() || null : null
    } else {
      update.closed_at = null
      update.closed_reason = null
    }
  }
  if (body.riskLevel && ['low', 'moderate', 'high'].includes(body.riskLevel)) {
    update.risk_level = body.riskLevel
  }
  if (typeof body.summary === 'string') {
    update.summary = body.summary.trim() || null
  }

  const { error } = await supabase
    .from('counseling_cases')
    .update(update)
    .eq('id', caseId)
    .eq('counselor_profile_id', caller.userId)

  if (error) {
    return NextResponse.json({ error: 'Could not update the case. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
