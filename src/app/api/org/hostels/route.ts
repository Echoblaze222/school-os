// src/app/api/org/hostels/route.ts
// GET: list hostels for the caller's school. Same "same-school, any
// authenticated staff" read floor as /api/org/departments - used
// wherever a hostel picker is needed (Leadership's HP/warden-tier scope
// steps, and the enrolment form's role-scope step).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const { data, error } = await supabase.from('hostels').select('id, name').eq('school_id', ctx.schoolId).order('name')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, hostels: data ?? [] })
}
