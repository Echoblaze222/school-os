// src/app/api/org/departments/[id]/route.ts
// GET: a single department plus its member roster (teachers with
// profiles.department_id = this department).
// PATCH: edit a department's name/description. Grant: 'edit' - Principal
// or Vice Principal.
// DELETE: remove a department. Grant: 'delete' - Principal only (Vice
// Principal has no delete grant anywhere in the §25 matrix).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { updateDepartment, deleteDepartment, getDepartmentMembers, PermissionError } from '@/lib/supabase/appointments'

async function getContextAndSubject(supabase: any, userId: string) {
  const ctx = await resolveUserContext(supabase, userId)
  if (!ctx) return { ctx: null, subject: null as null }
  const subject: 'principal' | 'vice_principal' | null =
    ctx.baseRole === 'principal' ? 'principal'
    : ctx.appointments.some((a: any) => a.appointment_type === 'vice_principal') ? 'vice_principal'
    : null
  return { ctx, subject }
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const { data: department } = await supabase
    .from('departments').select('*').eq('id', id).eq('school_id', ctx.schoolId).single()
  if (!department) return NextResponse.json({ ok: false, error: 'Department not found.' }, { status: 404 })

  const members = await getDepartmentMembers(supabase, ctx.schoolId, id)
  return NextResponse.json({ ok: true, department, members })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const { ctx, subject } = await getContextAndSubject(supabase, user.id)
  if (!ctx || !subject) return NextResponse.json({ ok: false, error: 'You do not have permission to edit departments.' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const input: { name?: string; description?: string | null } = {}
  if (typeof body?.name === 'string') input.name = body.name.trim()
  if (body && 'description' in body) input.description = typeof body.description === 'string' ? body.description : null

  try {
    await updateDepartment(ctx, subject, id, input)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/org/departments/id] update error:', err)
    return NextResponse.json({ ok: false, error: 'Could not update department.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx || ctx.baseRole !== 'principal') {
    return NextResponse.json({ ok: false, error: 'Only the Principal can delete a department.' }, { status: 403 })
  }

  try {
    await deleteDepartment(ctx, 'principal', id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/org/departments/id] delete error:', err)
    return NextResponse.json({ ok: false, error: 'Could not delete department.' }, { status: 500 })
  }
}
