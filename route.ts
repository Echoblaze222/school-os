// src/app/api/coach/sessions/[sessionId]/attendance/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

const STATUSES = ['present', 'absent', 'excused', 'injured']

async function requireCoachForSession(sessionId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return null
  const isCoach = await hasActiveAppointment(supabase, user.id, profile.school_id, 'coach')
  if (!isCoach) return null

  const admin = createAdminClient()
  const { data: session } = await admin
    .from('training_sessions')
    .select('id, team:sports_teams!inner(coach_profile_id)')
    .eq('id', sessionId)
    .eq('school_id', profile.school_id)
    .single()
  const team = Array.isArray(session?.team) ? session?.team[0] : session?.team
  if (!session || team?.coach_profile_id !== user.id) return null

  return { userId: user.id, schoolId: profile.school_id }
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const caller = await requireCoachForSession(sessionId)
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.studentId || !body?.status || !STATUSES.includes(body.status)) {
    return NextResponse.json({ ok: false, error: 'studentId and a valid status are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: entry, error } = await admin
    .from('training_attendance')
    .upsert({
      session_id: sessionId,
      student_id: body.studentId,
      status: body.status,
      notes: body.notes ? String(body.notes).trim() : null,
    }, { onConflict: 'session_id,student_id' })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, attendance: entry })
}
