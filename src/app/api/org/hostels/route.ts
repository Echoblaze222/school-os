// src/app/api/org/hostels/route.ts
// GET: list hostels for the caller's school. Same "same-school, any
// authenticated staff" read floor as /api/org/departments - used
// wherever a hostel picker is needed (Leadership's HP/warden-tier scope
// steps, and the enrolment form's role-scope step).
//
// POST: principal-only, creates a hostel. Added because nothing in this
// codebase could create one anywhere before this - the entire hostel
// module (rooms, roll-call, incidents, dashboard) assumed hostels
// already existed, and the enrolment form's "Select at least one
// hostel... No hostels exist yet" was a genuine dead end with no path
// forward, not just a validation message.
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

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  if (!profile || (profile as any).role !== 'principal') {
    return NextResponse.json({ ok: false, error: 'Only the principal can add a hostel.' }, { status: 403 })
  }

  const { name } = await request.json()
  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ ok: false, error: 'A hostel name is required.' }, { status: 400 })
  }

  const { data: hostel, error } = await supabase
    .from('hostels')
    .insert({ school_id: (profile as any).school_id, name: name.trim() })
    .select('id, name')
    .single()
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, hostel })
}
