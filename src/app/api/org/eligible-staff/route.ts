// src/app/api/org/eligible-staff/route.ts
// GET ?appointmentType=hod - returns people at the caller's school whose
// base role matches that appointment type's baseRoleScope (see
// appointments-types.ts), for use in an assignment picker.
//
// Gated to whoever can actually call POST /api/appointments (principal, or
// a vice_principal for 'hod'). This used to be open to any authenticated
// caller on the theory that it was "no more sensitive than the existing
// staff directory" - true while every appointment type's baseRoleScope was
// staff-only. hostel_prefect's baseRoleScope is ['student'], which turned
// that same open endpoint into a full student-roster leak (name + avatar +
// role + department for every student at the school) to anyone logged in,
// including other students and parents. Locking this down to the same
// allow-list as the write endpoint closes that without changing behavior
// for the existing hod/vice_principal callers, who were always principal
// or VP anyway.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from '@/lib/supabase/appointments-types'

export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const canAssign = ctx.baseRole === 'principal' || ctx.appointments.some(a => a.appointment_type === 'vice_principal')
  if (!canAssign) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to view this list.' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const appointmentType = searchParams.get('appointmentType') as AppointmentTypeId | null
  const config = appointmentType ? APPOINTMENT_TYPES[appointmentType] : undefined
  if (!config) return NextResponse.json({ ok: false, error: 'Unknown appointment type.' }, { status: 400 })

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, role, department_id, employee_id')
    .eq('school_id', ctx.schoolId)
    .in('role', config.baseRoleScope)
    .order('full_name', { ascending: true })

  if (error) {
    console.error('[api/org/eligible-staff] error:', error.message)
    return NextResponse.json({ ok: false, error: 'Could not load staff.' }, { status: 500 })
  }

  // Exclude people who already actively hold this exact type - matches
  // the duplicate guard in assignAppointment, so the picker never offers
  // a name that would just bounce off that check. Skipped for 'hod':
  // HOD uniqueness is per-department (enforced separately, department by
  // department), not global - someone already HOD of Science should
  // still be selectable as HOD of Math.
  let eligible = data ?? []
  if (appointmentType !== 'hod') {
    const { data: existingHolders } = await supabase
      .from('appointments')
      .select('profile_id')
      .eq('school_id', ctx.schoolId)
      .eq('appointment_type', appointmentType)
      .eq('status', 'active')
    const alreadyHeld = new Set((existingHolders ?? []).map((h: { profile_id: string }) => h.profile_id))
    eligible = eligible.filter(p => !alreadyHeld.has(p.id))
  }

  return NextResponse.json({ ok: true, staff: eligible })
}
