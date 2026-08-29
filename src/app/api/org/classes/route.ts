// src/app/api/org/classes/route.ts
// GET: list active classes for the caller's school. Same read floor as
// /api/org/departments and /api/org/hostels.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const { data, error } = await supabase.from('classes').select('id, name').eq('school_id', ctx.schoolId).eq('is_active', true).order('name')
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, classes: data ?? [] })
}
