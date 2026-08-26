// src/app/api/nurse/medications/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

const STATUSES = ['pending', 'administered', 'refused', 'missed']

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
  const status = url.searchParams.get('status')

  const admin = createAdminClient()
  let query = admin
    .from('medication_administrations')
    .select('id, medication_name, dosage, scheduled_for, administered_at, status, notes, student_id, profiles!medication_administrations_student_id_fkey(id, full_name, avatar_url)')
    .eq('school_id', caller.schoolId)
    .order('scheduled_for', { ascending: true })
    .limit(200)

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, medications: data ?? [] })
}

export async function POST(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.studentId || !body?.medicationName || !body?.dosage || !body?.scheduledFor) {
    return NextResponse.json({ ok: false, error: 'studentId, medicationName, dosage and scheduledFor are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: student } = await admin.from('profiles').select('id').eq('id', body.studentId).eq('school_id', caller.schoolId).eq('role', 'student').single()
  if (!student) return NextResponse.json({ ok: false, error: 'Student not found at your school.' }, { status: 400 })

  const { data: entry, error } = await admin
    .from('medication_administrations')
    .insert({
      school_id: caller.schoolId,
      student_id: body.studentId,
      medication_name: String(body.medicationName).trim(),
      dosage: String(body.dosage).trim(),
      scheduled_for: body.scheduledFor,
      notes: body.notes ? String(body.notes).trim() : null,
      created_by: caller.userId,
      status: 'pending',
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, medication: entry })
}

export async function PATCH(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.id || !body?.status || !STATUSES.includes(body.status)) {
    return NextResponse.json({ ok: false, error: 'id and a valid status are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const update: Record<string, unknown> = { status: body.status }
  if (body.status === 'administered') {
    update.administered_at = new Date().toISOString()
    update.nurse_profile_id = caller.userId
  }
  if (body.notes !== undefined) update.notes = body.notes ? String(body.notes).trim() : null

  const { data: entry, error } = await admin
    .from('medication_administrations')
    .update(update)
    .eq('id', body.id)
    .eq('school_id', caller.schoolId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, medication: entry })
}
