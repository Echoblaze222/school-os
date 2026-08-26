// src/app/api/coach/sessions/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

async function requireCoach() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return null
  const isCoach = await hasActiveAppointment(supabase, user.id, profile.school_id, 'coach')
  if (!isCoach) return null
  return { userId: user.id, schoolId: profile.school_id }
}

export async function GET(request: Request) {
  const caller = await requireCoach()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const url = new URL(request.url)
  const teamId = url.searchParams.get('teamId')

  const admin = createAdminClient()
  let query = admin
    .from('training_sessions')
    .select('*, team:sports_teams!inner(id, name, coach_profile_id), attendance:training_attendance(id, student_id, status)')
    .eq('school_id', caller.schoolId)
    .eq('team.coach_profile_id', caller.userId)
    .order('scheduled_at', { ascending: false })
    .limit(100)

  if (teamId) query = query.eq('team_id', teamId)

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, sessions: data ?? [] })
}

export async function POST(request: Request) {
  const caller = await requireCoach()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.teamId || !body?.scheduledAt) return NextResponse.json({ ok: false, error: 'teamId and scheduledAt are required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: team } = await admin.from('sports_teams').select('id').eq('id', body.teamId).eq('school_id', caller.schoolId).eq('coach_profile_id', caller.userId).single()
  if (!team) return NextResponse.json({ ok: false, error: 'Team not found.' }, { status: 400 })

  const { data: session, error } = await admin
    .from('training_sessions')
    .insert({
      school_id: caller.schoolId,
      team_id: body.teamId,
      scheduled_at: body.scheduledAt,
      duration_minutes: body.durationMinutes ? Number(body.durationMinutes) : 60,
      location: body.location ? String(body.location).trim() : null,
      focus: body.focus ? String(body.focus).trim() : null,
      notes: body.notes ? String(body.notes).trim() : null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, session })
}
