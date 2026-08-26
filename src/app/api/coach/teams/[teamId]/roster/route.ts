// src/app/api/coach/teams/[teamId]/roster/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

async function requireCoachForTeam(teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return null
  const isCoach = await hasActiveAppointment(supabase, user.id, profile.school_id, 'coach')
  if (!isCoach) return null

  const admin = createAdminClient()
  const { data: team } = await admin.from('sports_teams').select('id').eq('id', teamId).eq('school_id', profile.school_id).eq('coach_profile_id', user.id).single()
  if (!team) return null

  return { userId: user.id, schoolId: profile.school_id }
}

export async function POST(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const caller = await requireCoachForTeam(teamId)
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.studentId) return NextResponse.json({ ok: false, error: 'studentId is required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: student } = await admin.from('profiles').select('id').eq('id', body.studentId).eq('school_id', caller.schoolId).eq('role', 'student').single()
  if (!student) return NextResponse.json({ ok: false, error: 'Student not found at your school.' }, { status: 400 })

  const { data: member, error } = await admin
    .from('sports_team_members')
    .insert({
      team_id: teamId,
      student_id: body.studentId,
      position: body.position ? String(body.position).trim() : null,
      jersey_number: body.jerseyNumber ? Number(body.jerseyNumber) : null,
    })
    .select('*, profiles:profiles!sports_team_members_student_id_fkey(id, full_name, avatar_url)')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ ok: false, error: 'This student is already on the team.' }, { status: 400 })
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, member })
}

export async function DELETE(request: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  const caller = await requireCoachForTeam(teamId)
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.memberId) return NextResponse.json({ ok: false, error: 'memberId is required.' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin.from('sports_team_members').delete().eq('id', body.memberId).eq('team_id', teamId)
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
