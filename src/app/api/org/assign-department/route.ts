// src/app/api/org/assign-department/route.ts
// Moves a teacher into (or out of) a department. This is membership, not
// authority - Grant: 'edit', unscoped for Vice Principal per the matrix.
// Secretary also carries an 'edit' grant for enrolment-adjacent staff
// data, so it's allowed here too. Assigning someone as HOD is a separate,
// scoped action - see /api/appointments.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { setTeacherDepartment, PermissionError } from '@/lib/supabase/appointments'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const subject: 'principal' | 'vice_principal' | 'secretary' | null =
    ctx.baseRole === 'principal' ? 'principal'
    : ctx.baseRole === 'secretary' ? 'secretary'
    : ctx.appointments.some(a => a.appointment_type === 'vice_principal') ? 'vice_principal'
    : null

  if (!subject) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to change staff department assignments.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const teacherId = typeof body?.teacherId === 'string' ? body.teacherId : null
  const departmentId = body && 'departmentId' in body
    ? (typeof body.departmentId === 'string' ? body.departmentId : null)
    : undefined

  if (!teacherId || departmentId === undefined) {
    return NextResponse.json({ ok: false, error: 'teacherId and departmentId are required.' }, { status: 400 })
  }

  try {
    await setTeacherDepartment(ctx, subject, teacherId, departmentId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/org/assign-department] error:', err)
    return NextResponse.json({ ok: false, error: 'Could not update department assignment.' }, { status: 500 })
  }
}
