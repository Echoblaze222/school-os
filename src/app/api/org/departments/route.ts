// src/app/api/org/departments/route.ts
// GET: list departments for the caller's school (any authenticated staff
// member - same "same-school read" floor as the departments RLS policy).
// POST: create a department. Grant: 'create'. Principal or Vice Principal
// only - re-verified server-side against the caller's real profile/
// appointments, never a client-supplied role.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext, can } from '@/lib/permissions'
import { listDepartments, createDepartment, PermissionError } from '@/lib/supabase/appointments'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const departments = await listDepartments(supabase, ctx.schoolId)
  return NextResponse.json({ ok: true, departments })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const subject: 'principal' | 'vice_principal' | null =
    ctx.baseRole === 'principal' ? 'principal'
    : ctx.appointments.some(a => a.appointment_type === 'vice_principal') ? 'vice_principal'
    : null

  if (!subject || can(subject, 'create') !== true) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to create departments.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const description = typeof body?.description === 'string' ? body.description : undefined

  if (!name) return NextResponse.json({ ok: false, error: 'Department name is required.' }, { status: 400 })
  if (name.length > 100) return NextResponse.json({ ok: false, error: 'Department name is too long.' }, { status: 400 })

  try {
    const department = await createDepartment(ctx, subject, { name, description })
    return NextResponse.json({ ok: true, department })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/org/departments] create error:', err)
    return NextResponse.json({ ok: false, error: 'Could not create department.' }, { status: 500 })
  }
}
