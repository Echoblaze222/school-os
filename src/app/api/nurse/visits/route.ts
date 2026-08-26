// src/app/api/nurse/visits/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

const OUTCOMES = ['returned_to_class', 'sent_home', 'hospital_referral', 'monitoring', 'other']

async function requireNurse() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('id, school_id, full_name').eq('id', user.id).single()
  if (!profile?.school_id) return null
  const isNurse = await hasActiveAppointment(supabase, user.id, profile.school_id, 'nurse')
  if (!isNurse) return null
  return { userId: user.id, schoolId: profile.school_id, fullName: profile.full_name }
}

export async function GET(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const url = new URL(request.url)
  const studentId = url.searchParams.get('studentId')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 50), 200)

  const admin = createAdminClient()
  let query = admin
    .from('clinic_visits')
    .select('id, reason, symptoms, temperature_c, blood_pressure, pulse_bpm, treatment_given, outcome, parent_notified, notes, visited_at, student_id, profiles!clinic_visits_student_id_fkey(id, full_name, avatar_url)')
    .eq('school_id', caller.schoolId)
    .order('visited_at', { ascending: false })
    .limit(limit)

  if (studentId) query = query.eq('student_id', studentId)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, visits: data ?? [] })
}

export async function POST(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.studentId || !body?.reason) {
    return NextResponse.json({ ok: false, error: 'studentId and reason are required.' }, { status: 400 })
  }
  if (body.outcome && !OUTCOMES.includes(body.outcome)) {
    return NextResponse.json({ ok: false, error: 'Invalid outcome.' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Confirm the student actually belongs to this school before logging
  // a visit against them - never trust an id from the client alone.
  const { data: student } = await admin.from('profiles').select('id').eq('id', body.studentId).eq('school_id', caller.schoolId).eq('role', 'student').single()
  if (!student) return NextResponse.json({ ok: false, error: 'Student not found at your school.' }, { status: 400 })

  const { data: visit, error } = await admin
    .from('clinic_visits')
    .insert({
      school_id: caller.schoolId,
      student_id: body.studentId,
      nurse_profile_id: caller.userId,
      reason: String(body.reason).trim(),
      symptoms: body.symptoms ? String(body.symptoms).trim() : null,
      temperature_c: body.temperatureC ?? null,
      blood_pressure: body.bloodPressure ?? null,
      pulse_bpm: body.pulseBpm ?? null,
      treatment_given: body.treatmentGiven ? String(body.treatmentGiven).trim() : null,
      outcome: body.outcome ?? 'returned_to_class',
      parent_notified: !!body.parentNotified,
      notes: body.notes ? String(body.notes).trim() : null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, visit })
}
