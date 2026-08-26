// src/app/api/coach/matches/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

const STATUSES = ['scheduled', 'completed', 'cancelled', 'postponed']

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
  const { data, error } = await admin
    .from('sports_matches')
    .select('*, team:sports_teams!inner(id, name, coach_profile_id)')
    .eq('school_id', caller.schoolId)
    .eq('team.coach_profile_id', caller.userId)
    .order('scheduled_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, matches: data ?? [] })
}

export async function POST(request: Request) {
  const caller = await requireCoach()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.teamId || !body?.opponent || !body?.scheduledAt) {
    return NextResponse.json({ ok: false, error: 'teamId, opponent and scheduledAt are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: team } = await admin.from('sports_teams').select('id').eq('id', body.teamId).eq('school_id', caller.schoolId).eq('coach_profile_id', caller.userId).single()
  if (!team) return NextResponse.json({ ok: false, error: 'Team not found.' }, { status: 400 })

  const { data: match, error } = await admin
    .from('sports_matches')
    .insert({
      school_id: caller.schoolId,
      team_id: body.teamId,
      opponent: String(body.opponent).trim(),
      scheduled_at: body.scheduledAt,
      location: body.location ? String(body.location).trim() : null,
      is_home: body.isHome !== false,
      notes: body.notes ? String(body.notes).trim() : null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, match })
}

export async function PATCH(request: Request) {
  const caller = await requireCoach()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required.' }, { status: 400 })
  if (body.status && !STATUSES.includes(body.status)) {
    return NextResponse.json({ ok: false, error: 'Invalid status.' }, { status: 400 })
  }

  const admin = createAdminClient()
  // Confirm this match belongs to a team this coach actually owns before
  // updating - the same "never trust the id alone" pattern as elsewhere.
  const { data: existing } = await admin
    .from('sports_matches')
    .select('id, team:sports_teams!inner(coach_profile_id)')
    .eq('id', body.id).eq('school_id', caller.schoolId).single()
  const team = Array.isArray(existing?.team) ? existing?.team[0] : existing?.team
  if (!existing || team?.coach_profile_id !== caller.userId) {
    return NextResponse.json({ ok: false, error: 'Match not found.' }, { status: 404 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.status !== undefined) update.status = body.status
  if (body.ourScore !== undefined) update.our_score = body.ourScore === null ? null : Number(body.ourScore)
  if (body.opponentScore !== undefined) update.opponent_score = body.opponentScore === null ? null : Number(body.opponentScore)
  if (body.notes !== undefined) update.notes = body.notes ? String(body.notes).trim() : null

  const { data: match, error } = await admin.from('sports_matches').update(update).eq('id', body.id).select('*').single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, match })
}
