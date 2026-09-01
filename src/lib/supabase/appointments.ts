// src/lib/supabase/appointments.ts
//
// Data access for the Phase 1 org-hierarchy model (departments,
// appointments) plus the Lane A additions (departments.description,
// profiles.department_id - see org-hierarchy-additions.sql).
//
// Every write function here takes an already-resolved UserContext
// (see permissions.ts) and re-checks the specific grant itself. Nothing
// in this file trusts a role or scope string passed in from a request
// body - the caller's context always comes from resolveUserContext(),
// which reads the database, not the request.
//
// Reads use whatever client is passed in (so RLS still applies for
// same-school scoping as the floor). Writes use the service-role client,
// because departments/appointments have no client-writable RLS policy by
// design (see identity-appointments-schema.sql) - the permission check
// below IS the write gate, not a convenience layer on top of one.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './admin'
import { auditLog } from '../auditLog'
import { can, getAppointment, getVpDepartmentScope, type UserContext } from '../permissions'
import type { AppointmentTypeId, Appointment } from './appointments-types'
import { APPOINTMENT_TYPES } from './appointments-types'

export interface Department {
  id: string
  school_id: string
  name: string
  description: string | null
  created_at: string
}

export interface DepartmentWithStats extends Department {
  hod: { id: string; full_name: string; appointment_id: string } | null
  member_count: number
}

export class PermissionError extends Error {
  constructor(message: string) { super(message); this.name = 'PermissionError' }
}

// ---------------------------------------------------------------------
// Departments
// ---------------------------------------------------------------------

export async function listDepartments(
  supabase: SupabaseClient,
  schoolId: string,
): Promise<DepartmentWithStats[]> {
  const { data: departments, error } = await supabase
    .from('departments')
    .select('*')
    .eq('school_id', schoolId)
    .order('name', { ascending: true })

  if (error || !departments) {
    console.error('[appointments] listDepartments error:', error?.message)
    return []
  }
  if (departments.length === 0) return []

  const deptIds = departments.map((d: any) => d.id)

  const [{ data: hodAppointments, error: hodErr }, { data: members }] = await Promise.all([
    supabase
      .from('appointments')
      // See the same fix/comment in dashboard/principal/leadership/page.tsx -
      // profile_id must be specified since appointments has multiple FKs
      // to profiles (profile_id, reports_to_profile_id, assigned_by,
      // revoked_by), and an unqualified `profiles(...)` embed is ambiguous.
      .select('id, department_id, profile_id, profiles!profile_id(id, full_name)')
      .eq('school_id', schoolId)
      .eq('appointment_type', 'hod')
      .eq('status', 'active')
      .in('department_id', deptIds),
    supabase
      .from('profiles')
      .select('id, department_id')
      .eq('school_id', schoolId)
      .in('department_id', deptIds),
  ])
  if (hodErr) console.error('[appointments] listDepartments HOD query error:', hodErr.message)

  const hodByDept = new Map<string, { id: string; full_name: string; appointment_id: string }>()
  for (const a of (hodAppointments ?? []) as any[]) {
    const person = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles
    if (a.department_id && person) {
      hodByDept.set(a.department_id, { id: person.id, full_name: person.full_name, appointment_id: a.id })
    }
  }
  const countByDept = new Map<string, number>()
  for (const m of (members ?? []) as any[]) {
    if (m.department_id) countByDept.set(m.department_id, (countByDept.get(m.department_id) ?? 0) + 1)
  }

  return departments.map((d: any) => ({
    ...d,
    hod: hodByDept.get(d.id) ?? null,
    member_count: countByDept.get(d.id) ?? 0,
  }))
}

export async function getDepartmentMembers(
  supabase: SupabaseClient,
  schoolId: string,
  departmentId: string,
) {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, avatar_url, subjects_taught, employee_id, last_activity')
    .eq('school_id', schoolId)
    .eq('department_id', departmentId)
    .eq('role', 'teacher')
    .order('full_name', { ascending: true })

  if (error) {
    console.error('[appointments] getDepartmentMembers error:', error.message)
    return []
  }
  return data ?? []
}

/**
 * Create a department. Grant: 'create' - Principal (full) or Vice
 * Principal (also full for this action per the matrix; departments
 * themselves aren't a scoped resource, only approve/publish/assign are).
 */
export async function createDepartment(
  ctx: UserContext,
  subject: 'principal' | 'vice_principal',
  input: { name: string; description?: string },
): Promise<Department> {
  if (can(subject, 'create') !== true) {
    throw new PermissionError('You do not have permission to create departments.')
  }
  const name = input.name.trim()
  if (!name) throw new PermissionError('Department name is required.')

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('departments')
    .insert({ school_id: ctx.schoolId, name, description: input.description?.trim() || null })
    .select('*')
    .single()

  if (error) {
    if (error.code === '23505') throw new PermissionError(`A department named "${name}" already exists.`)
    throw new Error(`Could not create department: ${error.message}`)
  }

  await auditLog(admin, {
    actorId: ctx.userId, action: 'department.create',
    targetTable: 'departments', targetId: data.id,
    metadata: { name },
  })

  return data as Department
}

export async function updateDepartment(
  ctx: UserContext,
  subject: 'principal' | 'vice_principal',
  departmentId: string,
  input: { name?: string; description?: string | null },
): Promise<void> {
  if (can(subject, 'edit') !== true) {
    throw new PermissionError('You do not have permission to edit departments.')
  }
  const admin = createAdminClient()

  // Re-verify the department actually belongs to the caller's school -
  // never trust that the id in the request is already scoped correctly.
  const { data: existing } = await admin
    .from('departments').select('id, school_id').eq('id', departmentId).single()
  if (!existing || existing.school_id !== ctx.schoolId) {
    throw new PermissionError('Department not found.')
  }

  const patch: Record<string, unknown> = {}
  if (input.name !== undefined) patch.name = input.name.trim()
  if (input.description !== undefined) patch.description = input.description?.trim() || null
  if (Object.keys(patch).length === 0) return

  const { error } = await admin.from('departments').update(patch).eq('id', departmentId)
  if (error) throw new Error(`Could not update department: ${error.message}`)

  await auditLog(admin, {
    actorId: ctx.userId, action: 'department.update',
    targetTable: 'departments', targetId: departmentId, metadata: patch,
  })
}

/** Delete: Principal only (VP has no delete grant on anything). */
export async function deleteDepartment(
  ctx: UserContext,
  subject: 'principal',
  departmentId: string,
): Promise<void> {
  if (can(subject, 'delete') !== true) {
    throw new PermissionError('You do not have permission to delete departments.')
  }
  const admin = createAdminClient()
  const { data: existing } = await admin
    .from('departments').select('id, school_id, name').eq('id', departmentId).single()
  if (!existing || existing.school_id !== ctx.schoolId) {
    throw new PermissionError('Department not found.')
  }

  // Detach members and any HOD/etc. appointments rather than leaving
  // dangling references - department_id columns are ON DELETE SET NULL /
  // nullable by design, but being explicit here keeps the audit trail
  // readable instead of relying on the FK side effect alone.
  await admin.from('profiles').update({ department_id: null }).eq('department_id', departmentId)
  await admin.from('appointments')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: ctx.userId })
    .eq('department_id', departmentId).eq('status', 'active')

  const { error } = await admin.from('departments').delete().eq('id', departmentId)
  if (error) throw new Error(`Could not delete department: ${error.message}`)

  await auditLog(admin, {
    actorId: ctx.userId, action: 'department.delete',
    targetTable: 'departments', targetId: departmentId, metadata: { name: existing.name },
  })
}

/**
 * Move a teacher into (or out of, with departmentId = null) a department.
 * Grant: 'edit'. Full for both Principal and Vice Principal - this is
 * membership, not authority; assigning someone as HOD is the separate,
 * scoped 'assign' action below.
 */
export async function setTeacherDepartment(
  ctx: UserContext,
  subject: 'principal' | 'vice_principal' | 'secretary',
  teacherId: string,
  departmentId: string | null,
): Promise<void> {
  if (can(subject, 'edit') !== true) {
    throw new PermissionError('You do not have permission to change staff department assignments.')
  }
  const admin = createAdminClient()

  const { data: teacher } = await admin
    .from('profiles').select('id, school_id, role').eq('id', teacherId).single()
  if (!teacher || teacher.school_id !== ctx.schoolId) {
    throw new PermissionError('Staff member not found.')
  }
  if (teacher.role !== 'teacher') {
    throw new PermissionError('Only teaching staff can be assigned to a department.')
  }
  if (departmentId) {
    const { data: dept } = await admin
      .from('departments').select('id, school_id').eq('id', departmentId).single()
    if (!dept || dept.school_id !== ctx.schoolId) {
      throw new PermissionError('Department not found.')
    }
  }

  const { error } = await admin.from('profiles').update({ department_id: departmentId }).eq('id', teacherId)
  if (error) throw new Error(`Could not update department assignment: ${error.message}`)

  await auditLog(admin, {
    actorId: ctx.userId, action: 'staff.department_assign',
    targetTable: 'profiles', targetId: teacherId, metadata: { department_id: departmentId },
  })
}

// ---------------------------------------------------------------------
// Appointments (HOD assignment, and - for Principal - any appointment
// type, including creating the first Vice Principal)
// ---------------------------------------------------------------------

interface AssignAppointmentInput {
  profileId: string
  appointmentType: AppointmentTypeId
  departmentId?: string | null
  scope?: Record<string, unknown>
}

/**
 * Create (or replace) an active appointment. Two callers, two different
 * grant checks:
 *  - Principal, any appointment type: 'manage' (Principal-only grant -
 *    this is how a school gets its first Vice Principal, and how HOD/
 *    every other appointment type gets assigned too).
 *  - Vice Principal, appointment_type 'hod' only, and only within a
 *    department already inside that VP's own configured scope: 'assign'
 *    (scoped). Any other appointment type, or a department outside scope,
 *    is rejected here - never left to the UI to prevent.
 */
export async function assignAppointment(
  ctx: UserContext,
  subject: 'principal' | 'vice_principal',
  input: AssignAppointmentInput,
): Promise<Appointment> {
  const admin = createAdminClient()

  if (subject === 'principal') {
    if (can('principal', 'manage') !== true) {
      throw new PermissionError('You do not have permission to assign appointments.')
    }
  } else {
    if (can('vice_principal', 'assign') !== 'scoped') {
      throw new PermissionError('You do not have permission to assign appointments.')
    }
    if (input.appointmentType !== 'hod') {
      throw new PermissionError('A Vice Principal can only assign Heads of Department.')
    }
    const vpAppt = getAppointment(ctx, 'vice_principal')
    if (!vpAppt) throw new PermissionError('Your Vice Principal appointment could not be verified.')
    const { departmentIds } = getVpDepartmentScope(vpAppt)
    if (!input.departmentId || !departmentIds.includes(input.departmentId)) {
      throw new PermissionError(
        departmentIds.length === 0
          ? "Your Vice Principal appointment doesn't have any departments assigned yet. Ask your Principal to configure your scope first."
          : 'That department is outside the departments assigned to your Vice Principal role.',
      )
    }
  }

  // Verify target profile is real, same school, and eligible for this
  // appointment type per its baseRoleScope - re-derive from the DB, never
  // trust the request body's claim about who this person is.
  const { data: target } = await admin
    .from('profiles').select('id, school_id, role, full_name').eq('id', input.profileId).single()
  if (!target || target.school_id !== ctx.schoolId) {
    throw new PermissionError('Staff member not found.')
  }
  if (!APPOINTMENT_TYPES[input.appointmentType].baseRoleScope.includes(target.role)) {
    throw new PermissionError(
      `${target.full_name} can't hold this appointment - ${APPOINTMENT_TYPES[input.appointmentType].label} is only available to ${APPOINTMENT_TYPES[input.appointmentType].baseRoleScope.join('/')} accounts.`,
    )
  }

  if (input.departmentId) {
    const { data: dept } = await admin
      .from('departments').select('id, school_id').eq('id', input.departmentId).single()
    if (!dept || dept.school_id !== ctx.schoolId) throw new PermissionError('Department not found.')
  }

  // Block re-appointing someone who already actively holds this exact
  // type - but only for non-department-scoped types (vice_principal,
  // counselor, nurse, the hostel/class-scoped types, etc). Department-
  // scoped types (HOD) are deliberately excluded: their uniqueness is
  // per-department, handled by the revoke-then-insert block right below,
  // and a person can legitimately be HOD of two different departments -
  // this check would otherwise block that by matching on type alone.
  if (!input.departmentId) {
    const { data: dupe } = await admin
      .from('appointments')
      .select('id')
      .eq('school_id', ctx.schoolId)
      .eq('appointment_type', input.appointmentType)
      .eq('profile_id', input.profileId)
      .eq('status', 'active')
    if (dupe && dupe.length > 0) {
      throw new PermissionError(`${target.full_name} already holds this appointment.`)
    }
  }

  // Enforce one active holder per (school, appointment_type, department) -
  // revoke whoever currently holds it before inserting the replacement, so
  // "who is the HOD of Science" never has two conflicting answers.
  //
  // Only applies when department_id is actually set. Appointment types
  // like 'vice_principal' are typically department_id = null (their real
  // scope lives in scope.department_ids, which can differ VP to VP - a
  // school can have a VP-Academics and a VP-Administration at once). If
  // this ran unconditionally, appointing a second VP would revoke the
  // first one just because both rows share department_id = null.
  if (input.departmentId) {
    const { data: existingHolders } = await admin
      .from('appointments')
      .select('id')
      .eq('school_id', ctx.schoolId)
      .eq('appointment_type', input.appointmentType)
      .eq('status', 'active')
      .eq('department_id', input.departmentId)

    if (existingHolders && existingHolders.length > 0) {
      await admin.from('appointments')
        .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: ctx.userId })
        .in('id', existingHolders.map((h: any) => h.id))
    }
  }

  const { data: created, error } = await admin
    .from('appointments')
    .insert({
      school_id: ctx.schoolId,
      profile_id: input.profileId,
      appointment_type: input.appointmentType,
      department_id: input.departmentId ?? null,
      scope: input.scope ?? {},
      assigned_by: ctx.userId,
      status: 'active',
    })
    .select('*')
    .single()

  if (error) throw new Error(`Could not create appointment: ${error.message}`)

  await auditLog(admin, {
    actorId: ctx.userId, action: 'appointment.assign',
    targetTable: 'appointments', targetId: created.id,
    metadata: { profile_id: input.profileId, appointment_type: input.appointmentType, department_id: input.departmentId ?? null, target_name: target.full_name },
  })

  return created as Appointment
}

/**
 * Update the scope (departments/portfolio) of an already-active Vice
 * Principal appointment, in place - without revoking and re-issuing it.
 *
 * Principal-only for now (mirrors assignAppointment's principal branch):
 * a VP can configure HODs within their scope, but not widen their own
 * scope. Narrowed to 'vice_principal' deliberately rather than any
 * appointment type - HOD/hostel-prefect scope changes go through
 * revoke-and-reassign (the existing, exercised path) until there's a
 * concrete need to edit those in place too.
 */
export async function updateAppointmentScope(
  ctx: UserContext,
  appointmentId: string,
  updates: { portfolio?: string; departmentIds?: string[] },
): Promise<Appointment> {
  const admin = createAdminClient()

  if (can('principal', 'manage') !== true) {
    throw new PermissionError('You do not have permission to edit appointments.')
  }

  const { data: appt } = await admin.from('appointments').select('*').eq('id', appointmentId).single()
  if (!appt || appt.school_id !== ctx.schoolId || appt.status !== 'active') {
    throw new PermissionError('Appointment not found.')
  }
  if (appt.appointment_type !== 'vice_principal') {
    throw new PermissionError('Only a Vice Principal appointment can be edited this way.')
  }

  if (updates.departmentIds && updates.departmentIds.length > 0) {
    const { data: owned } = await admin
      .from('departments').select('id').eq('school_id', ctx.schoolId).in('id', updates.departmentIds)
    const validIds = new Set((owned ?? []).map((d: { id: string }) => d.id))
    const invalid = updates.departmentIds.filter(id => !validIds.has(id))
    if (invalid.length > 0) throw new PermissionError('One or more selected departments could not be found at your school.')
  }

  const nextScope: Record<string, unknown> = { ...(appt.scope ?? {}) }
  if (updates.portfolio !== undefined) {
    if (updates.portfolio) nextScope.portfolio = updates.portfolio
    else delete nextScope.portfolio
  }
  if (updates.departmentIds !== undefined) {
    nextScope.department_ids = updates.departmentIds
  }

  const { data: saved, error } = await admin
    .from('appointments')
    .update({ scope: nextScope })
    .eq('id', appointmentId)
    .select('*')
    .single()

  if (error) throw new Error(`Could not update appointment: ${error.message}`)

  await auditLog(admin, {
    actorId: ctx.userId, action: 'appointment.update_scope',
    targetTable: 'appointments', targetId: appointmentId,
    metadata: { appointment_type: appt.appointment_type, scope: nextScope },
  })

  return saved as Appointment
}

export async function revokeAppointment(
  ctx: UserContext,
  subject: 'principal' | 'vice_principal',
  appointmentId: string,
): Promise<void> {
  const admin = createAdminClient()
  const { data: appt } = await admin.from('appointments').select('*').eq('id', appointmentId).single()
  if (!appt || appt.school_id !== ctx.schoolId || appt.status !== 'active') {
    throw new PermissionError('Appointment not found.')
  }

  if (subject === 'principal') {
    if (can('principal', 'manage') !== true) throw new PermissionError('You do not have permission to revoke appointments.')
  } else {
    if (can('vice_principal', 'assign') !== 'scoped' || appt.appointment_type !== 'hod') {
      throw new PermissionError('You do not have permission to revoke this appointment.')
    }
    const vpAppt = getAppointment(ctx, 'vice_principal')
    const { departmentIds } = vpAppt ? getVpDepartmentScope(vpAppt) : { departmentIds: [] as string[] }
    if (!appt.department_id || !departmentIds.includes(appt.department_id)) {
      throw new PermissionError('That department is outside the departments assigned to your Vice Principal role.')
    }
  }

  const { error } = await admin.from('appointments')
    .update({ status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: ctx.userId })
    .eq('id', appointmentId)
  if (error) throw new Error(`Could not revoke appointment: ${error.message}`)

  await auditLog(admin, {
    actorId: ctx.userId, action: 'appointment.revoke',
    targetTable: 'appointments', targetId: appointmentId,
    metadata: { profile_id: appt.profile_id, appointment_type: appt.appointment_type },
  })
}

/** All active holders of a given appointment type at a school - used by notify.ts to target appointment-based audiences. */
export async function getAppointeesByType(
  supabase: SupabaseClient,
  schoolId: string,
  appointmentType: AppointmentTypeId,
): Promise<string[]> {
  const { data, error } = await supabase
    .from('appointments')
    .select('profile_id')
    .eq('school_id', schoolId)
    .eq('appointment_type', appointmentType)
    .eq('status', 'active')

  if (error) {
    console.error('[appointments] getAppointeesByType error:', error.message)
    return []
  }
  return (data ?? []).map((a: any) => a.profile_id)
}
