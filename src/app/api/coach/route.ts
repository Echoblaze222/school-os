// src/app/api/coach/students/route.ts
// Search for students to add to a team roster.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })
  const { data: profile } = await supabase.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })
  const isCoach = await hasActiveAppointment(supabase, user.id, profile.school_id, 'coach')
  if (!isCoach) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const url = new URL(request.url)
  const search = url.searchParams.get('search')?.trim()
  if (!search) return NextResponse.json({ ok: true, students: [] })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('profiles')
    .select('id, full_name, avatar_url')
    .eq('school_id', profile.school_id)
    .eq('role', 'student')
    .ilike('full_name', `%${search}%`)
    .order('full_name')
    .limit(20)

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, students: data ?? [] })
}
