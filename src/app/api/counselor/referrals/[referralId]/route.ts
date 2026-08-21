// src/app/api/counselor/referrals/[referralId]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAppointment } from '@/lib/permissions'

export async function PATCH(request: Request, { params }: { params: Promise<{ referralId: string }> }) {
  const { referralId } = await params
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller || !caller.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { action, declineReason, category, riskLevel } = await request.json()
  if (!['accept', 'decline', 'convert_to_case'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 })
  }

  const { data: referral } = await supabase
    .from('counseling_referrals')
    .select('id, student_profile_id, status, referred_to_profile_id')
    .eq('id', referralId)
    .eq('school_id', caller.schoolId)
    .maybeSingle()

  if (!referral) {
    return NextResponse.json({ error: 'Referral not found.' }, { status: 404 })
  }
  if (referral.status !== 'pending') {
    return NextResponse.json({ error: 'This referral has already been reviewed.' }, { status: 409 })
  }
  if (referral.referred_to_profile_id && referral.referred_to_profile_id !== caller.userId) {
    return NextResponse.json({ error: 'This referral was addressed to a different counselor.' }, { status: 403 })
  }

  if (action === 'decline') {
    const { error } = await supabase
      .from('counseling_referrals')
      .update({
        status: 'declined',
        decline_reason: declineReason?.trim() || null,
        reviewed_by: caller.userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', referralId)

    if (error) return NextResponse.json({ error: 'Could not decline the referral.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // accept or convert_to_case both open (or reuse) a case for the student.
  const { data: existingCase } = await supabase
    .from('counseling_cases')
    .select('id')
    .eq('student_profile_id', referral.student_profile_id)
    .in('status', ['open', 'monitoring'])
    .maybeSingle()

  let caseId = existingCase?.id ?? null

  if (!caseId) {
    const { data: created, error: caseError } = await supabase
      .from('counseling_cases')
      .insert({
        school_id: caller.schoolId,
        student_profile_id: referral.student_profile_id,
        counselor_profile_id: caller.userId,
        category: ['academic_risk', 'attendance', 'behavioral', 'emotional', 'family', 'peer', 'other', 'general'].includes(category) ? category : 'general',
        risk_level: ['low', 'moderate', 'high'].includes(riskLevel) ? riskLevel : 'low',
        opened_by: caller.userId,
      })
      .select('id')
      .single()

    if (caseError) {
      return NextResponse.json({ error: 'Could not open a case for this referral.' }, { status: 500 })
    }
    caseId = created.id
  }

  const { error: refError } = await supabase
    .from('counseling_referrals')
    .update({
      status: 'converted_to_case',
      resulting_case_id: caseId,
      reviewed_by: caller.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', referralId)

  if (refError) {
    return NextResponse.json({ error: 'Could not update the referral.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, caseId })
}
