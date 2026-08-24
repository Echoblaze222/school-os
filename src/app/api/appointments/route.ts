// src/app/api/appointments/route.ts
// Shared write endpoint for the appointment layer. Two callers:
//  - Principal, any appointment_type ('manage' grant) - this is how a
//    school gets its first Vice Principal, among everything else.
//  - Vice Principal, appointment_type 'hod' only, within their own
//    configured department scope ('assign' grant, scoped).
// All the actual verification lives in lib/supabase/appointments.ts
// (assignAppointment/revokeAppointment) - this route is just the HTTP
// wrapper: parse input, resolve who's really asking, call through.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveUserContext } from '@/lib/permissions'
import { assignAppointment, revokeAppointment, updateAppointmentScope, PermissionError } from '@/lib/supabase/appointments'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from '@/lib/supabase/appointments-types'

function resolveSubject(ctx: Awaited<ReturnType<typeof resolveUserContext>>): 'principal' | 'vice_principal' | null {
  if (!ctx) return null
  if (ctx.baseRole === 'principal') return 'principal'
  if (ctx.appointments.some(a => a.appointment_type === 'vice_principal')) return 'vice_principal'
  return null
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  const subject = resolveSubject(ctx)
  if (!ctx || !subject) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to assign appointments.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const profileId = typeof body?.profileId === 'string' ? body.profileId : null
  const appointmentType = body?.appointmentType as AppointmentTypeId | undefined
  const departmentId = typeof body?.departmentId === 'string' ? body.departmentId : null
  const portfolio = typeof body?.portfolio === 'string' ? body.portfolio : undefined
  const departmentIds = Array.isArray(body?.departmentIds)
    ? body.departmentIds.filter((id: unknown): id is string => typeof id === 'string')
    : undefined
  const hostelIds = Array.isArray(body?.hostelIds)
    ? body.hostelIds.filter((id: unknown): id is string => typeof id === 'string')
    : undefined
  const classIds = Array.isArray(body?.classIds)
    ? body.classIds.filter((id: unknown): id is string => typeof id === 'string')
    : undefined

  if (!profileId || !appointmentType || !APPOINTMENT_TYPES[appointmentType]) {
    return NextResponse.json({ ok: false, error: 'profileId and a valid appointmentType are required.' }, { status: 400 })
  }

  // A Hostel Prefect's entire permission scope is this array (see
  // getHostelPrefectScope in lib/permissions.ts) - without it the
  // appointment is created but functionally dead, and the person can
  // never actually reach anything. Require it up front instead of
  // silently shipping an empty-scope appointment.
  if (appointmentType === 'hostel_prefect' && (!hostelIds || hostelIds.length === 0)) {
    return NextResponse.json({ ok: false, error: 'Select at least one hostel for a Hostel Prefect appointment.' }, { status: 400 })
  }

  const scope: Record<string, unknown> = {}
  if (portfolio) scope.portfolio = portfolio
  if (departmentIds && departmentIds.length > 0) scope.department_ids = departmentIds
  if (hostelIds && hostelIds.length > 0) {
    // Never trust client-supplied ids at face value - re-derive against
    // the caller's own school the same way assignAppointment already
    // re-derives profileId/departmentId below, rather than taking the
    // request body's word for what hostels exist.
    const admin = createAdminClient()
    const { data: ownedHostels } = await admin
      .from('hostels')
      .select('id')
      .eq('school_id', ctx.schoolId)
      .in('id', hostelIds)
    const validIds = new Set((ownedHostels ?? []).map((h: { id: string }) => h.id))
    const invalidIds = hostelIds.filter((id: string) => !validIds.has(id))
    if (invalidIds.length > 0) {
      return NextResponse.json({ ok: false, error: 'One or more selected hostels could not be found at your school.' }, { status: 400 })
    }
    scope.hostel_ids = hostelIds
  }
  if (classIds && classIds.length > 0) {
    // Same re-derive-don't-trust pattern as hostel_ids above.
    const admin = createAdminClient()
    const { data: ownedClasses } = await admin
      .from('classes')
      .select('id')
      .eq('school_id', ctx.schoolId)
      .in('id', classIds)
    const validIds = new Set((ownedClasses ?? []).map((c: { id: string }) => c.id))
    const invalidIds = classIds.filter((id: string) => !validIds.has(id))
    if (invalidIds.length > 0) {
      return NextResponse.json({ ok: false, error: 'One or more selected classes could not be found at your school.' }, { status: 400 })
    }
    scope.class_ids = classIds
  }

  try {
    const appointment = await assignAppointment(ctx, subject, {
      profileId, appointmentType, departmentId,
      scope: Object.keys(scope).length > 0 ? scope : undefined,
    })
    return NextResponse.json({ ok: true, appointment })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/appointments] assign error:', err)
    return NextResponse.json({ ok: false, error: 'Could not create appointment.' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  const subject = resolveSubject(ctx)
  if (!ctx || !subject) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to revoke appointments.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const appointmentId = typeof body?.appointmentId === 'string' ? body.appointmentId : null
  if (!appointmentId) return NextResponse.json({ ok: false, error: 'appointmentId is required.' }, { status: 400 })

  try {
    await revokeAppointment(ctx, subject, appointmentId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/appointments] revoke error:', err)
    return NextResponse.json({ ok: false, error: 'Could not revoke appointment.' }, { status: 500 })
  }
}

// Principal-only: edit an existing Vice Principal's department scope /
// portfolio without revoking and re-appointing them (see
// updateAppointmentScope's doc comment for why this is narrower than
// POST/DELETE - VP only, for now).
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx || ctx.baseRole !== 'principal') {
    return NextResponse.json({ ok: false, error: 'You do not have permission to edit appointments.' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const appointmentId = typeof body?.appointmentId === 'string' ? body.appointmentId : null
  if (!appointmentId) return NextResponse.json({ ok: false, error: 'appointmentId is required.' }, { status: 400 })

  const portfolio = typeof body?.portfolio === 'string' ? body.portfolio : undefined
  const departmentIds = Array.isArray(body?.departmentIds)
    ? body.departmentIds.filter((id: unknown): id is string => typeof id === 'string')
    : undefined

  try {
    const appointment = await updateAppointmentScope(ctx, appointmentId, { portfolio, departmentIds })
    return NextResponse.json({ ok: true, appointment })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/appointments] update error:', err)
    return NextResponse.json({ ok: false, error: 'Could not update appointment.' }, { status: 500 })
  }
}
