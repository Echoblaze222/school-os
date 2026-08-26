// src/app/api/coach/teams/route.ts
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

export async function GET() {
  const caller = await requireCoach()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const admin = createAdminClient()
  const { data: teams, error } = await admin
    .from('sports_teams')
    .select('*, members:sports_team_members(id, student_id, position, jersey_number, profiles:profiles!sports_team_members_student_id_fkey(id, full_name, avatar_url))')
    .eq('school_id', caller.schoolId)
    .eq('coach_profile_id', caller.userId)
    .order('created_at')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, teams: teams ?? [] })
}

export async function POST(request: Request) {
  const caller = await requireCoach()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.name || !body?.sport) return NextResponse.json({ ok: false, error: 'name and sport are required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: team, error } = await admin
    .from('sports_teams')
    .insert({
      school_id: caller.schoolId,
      coach_profile_id: caller.userId,
      name: String(body.name).trim(),
      sport: String(body.sport).trim(),
      season: body.season ? String(body.season).trim() : null,
      description: body.description ? String(body.description).trim() : null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, team })
}
