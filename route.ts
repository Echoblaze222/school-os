// src/app/api/nurse/health-records/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

async function requireNurse() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return null
  const isNurse = await hasActiveAppointment(supabase, user.id, profile.school_id, 'nurse')
  if (!isNurse) return null
  return { userId: user.id, schoolId: profile.school_id }
}

export async function GET(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim()

  const admin = createAdminClient()

  // Left-join style: every student at the school, with their health
  // profile if one exists - so a nurse can find and start a record for
  // a student who's never had one, not just search existing records.
  let studentsQuery = admin
    .from('profiles')
    .select('id, full_name, avatar_url, class_id')
    .eq('school_id', caller.schoolId)
    .eq('role', 'student')
    .order('full_name')
    .limit(200)

  if (search) studentsQuery = studentsQuery.ilike('full_name', `%${search}%`)

  const { data: students, error: studentsError } = await studentsQuery
  if (studentsError) return NextResponse.json({ ok: false, error: studentsError.message }, { status: 500 })

  const studentIds = (students ?? []).map(s => s.id)
  const { data: profiles } = studentIds.length > 0
    ? await admin.from('student_health_profiles').select('*').eq('school_id', caller.schoolId).in('student_id', studentIds)
    : { data: [] }

  const profileByStudent = new Map((profiles ?? []).map((p: any) => [p.student_id, p]))
  const records = (students ?? []).map(s => ({
    student: s,
    healthProfile: profileByStudent.get(s.id) ?? null,
  }))

  return NextResponse.json({ ok: true, records })
}

export async function POST(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.studentId) return NextResponse.json({ ok: false, error: 'studentId is required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: student } = await admin.from('profiles').select('id').eq('id', body.studentId).eq('school_id', caller.schoolId).eq('role', 'student').single()
  if (!student) return NextResponse.json({ ok: false, error: 'Student not found at your school.' }, { status: 400 })

  const toArray = (v: unknown) => Array.isArray(v) ? v.filter(x => typeof x === 'string' && x.trim()) : []

  const payload = {
    school_id: caller.schoolId,
    student_id: body.studentId,
    blood_group: body.bloodGroup ? String(body.bloodGroup).trim() : null,
    allergies: toArray(body.allergies),
    chronic_conditions: toArray(body.chronicConditions),
    current_medications: toArray(body.currentMedications),
    emergency_contact_name: body.emergencyContactName ? String(body.emergencyContactName).trim() : null,
    emergency_contact_phone: body.emergencyContactPhone ? String(body.emergencyContactPhone).trim() : null,
    physician_name: body.physicianName ? String(body.physicianName).trim() : null,
    physician_phone: body.physicianPhone ? String(body.physicianPhone).trim() : null,
    notes: body.notes ? String(body.notes).trim() : null,
    updated_by: caller.userId,
    updated_at: new Date().toISOString(),
  }

  const { data: record, error } = await admin
    .from('student_health_profiles')
    .upsert(payload, { onConflict: 'school_id,student_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, record })
}
