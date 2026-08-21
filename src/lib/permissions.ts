// src/lib/permissions.ts
// -------------------------------------------------------------------------
// Shared server-side permission helpers. Every route that checks "is this
// caller allowed to do X" should call these instead of hand-rolling another
// local Record<string, string[]> allow-list, see Phase 1 audit §3: that
// pattern is secure when done right, but duplicating it per-file is how a
// permission check eventually gets forgotten on a new route.
//
// These helpers never trust anything the client sent for the identity or
// role check itself (userId comes from the authenticated session, role
// comes from the database), the ONLY inputs that come from the client are
// resource ids being acted on, which callers must still scope by school_id
// and, where relevant, by ownership.
// -------------------------------------------------------------------------

import type { SupabaseClient } from '@supabase/supabase-js'
import type { AppointmentTypeId, Appointment, PermissionAction } from './supabase/appointments-types'
import type { UserRole } from './supabase/types'
import { redirect } from 'next/navigation'
import { createClient } from './supabase/server'

export interface CallerContext {
  userId: string
  role: string          // base profiles.role, 'teacher', 'principal', etc.
  schoolId: string | null
}

/**
 * Fetches the authenticated caller's profile (role, school) from the
 * database. Returns null if there is no session or no profile row, callers
 * must treat that as "reject the request", never as "allow by default".
 */
export async function getCallerContext(
  supabase: SupabaseClient
): Promise<CallerContext | null> {
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile) return null

  return { userId: user.id, role: (profile as any).role, schoolId: (profile as any).school_id ?? null }
}

/**
 * Checks whether the caller holds an ACTIVE appointment of the given type
 * at their own school. This is the appointment-layer equivalent of a base
 * role check (see appointments-types.ts, Counselor, ICT Officer, Warden,
 * etc. are appointments on top of the 'teacher' base role, not values of
 * profiles.role itself).
 *
 * Never infers access from appointment_type alone beyond "does this
 * appointment exist and is it active", any further scope restriction
 * (e.g. "only this counselor's own caseload") is enforced by the query
 * itself, not by this function, per the "no implied access" rule.
 */
export async function hasActiveAppointment(
  supabase: SupabaseClient,
  userId: string,
  schoolId: string,
  appointmentType: AppointmentTypeId
): Promise<boolean> {
  if (!userId || !schoolId) return false

  const { data, error } = await supabase
    .from('appointments')
    .select('id')
    .eq('profile_id', userId)
    .eq('school_id', schoolId)
    .eq('appointment_type', appointmentType)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle()

  if (error) return false
  return !!data
}

/**
 * Convenience wrapper for the common "reject unless authenticated AND
 * holds this active appointment" gate used at the top of every counselor
 * route. Returns the caller context on success, or null on failure, the
 * caller is responsible for returning the actual 401/403 response so each
 * route can word its own error message.
 */
export async function requireAppointment(
  supabase: SupabaseClient,
  appointmentType: AppointmentTypeId
): Promise<CallerContext | null> {
  const caller = await getCallerContext(supabase)
  if (!caller || !caller.schoolId) return null

  const ok = await hasActiveAppointment(supabase, caller.userId, caller.schoolId, appointmentType)
  if (!ok) return null

  return caller
}

/**
 * Verifies a role/context string a client claims to be acting as (e.g. the
 * `role` field on an AI chat request, or a context-switcher selection)
 * against what the caller can actually prove server-side: either it
 * matches their base profiles.role, or it matches an active appointment
 * they hold. Falls back to the caller's true base role when the claim
 * can't be verified, rather than trusting the claim or failing the whole
 * request, callers that need a hard failure instead of a silent
 * downgrade should check the returned `verified` flag themselves.
 */
export async function resolveVerifiedRole(
  supabase: SupabaseClient,
  caller: CallerContext,
  claimedRole: string
): Promise<{ role: string; verified: boolean }> {
  const normalized = (claimedRole || '').toLowerCase()

  if (normalized === caller.role) {
    return { role: normalized, verified: true }
  }

  if (caller.schoolId) {
    const ok = await hasActiveAppointment(
      supabase, caller.userId, caller.schoolId, normalized as AppointmentTypeId
    )
    if (ok) return { role: normalized, verified: true }
  }

  // Claimed role could not be proven, fall back to the caller's real base
  // role rather than trusting an unverified client-supplied value.
  return { role: caller.role, verified: false }
}

// -------------------------------------------------------------------------
// Below: the Hostel lane's independently-built helpers. Kept alongside the
// ones above rather than collapsed into one shape, since they solve a
// slightly different problem: these are multi-type and scope-aware (a
// warden's `scope` can limit them to one specific hostel) and fold in the
// "principal/secretary can see everything at their school" admin-override
// pattern used elsewhere in the app. New callers should pick whichever
// shape fits the check they need, not both.
// -------------------------------------------------------------------------

/**
 * Does this profile currently hold an active appointment of one of the
 * given types, at the given school? Returns the appointment row (with
 * its `scope`) if so, so callers can further narrow by scope.
 */
export async function getActiveAppointment(
  adminClient: SupabaseClient,
  profileId: string,
  schoolId: string,
  types: AppointmentTypeId[]
) {
  const { data, error } = await adminClient
    .from('appointments')
    .select('id, appointment_type, scope, department_id')
    .eq('profile_id', profileId)
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .in('appointment_type', types)
    .maybeSingle()

  if (error) {
    console.error('[permissions] getActiveAppointment failed:', error.message)
    return null
  }
  return data
}

export const HOSTEL_STAFF_APPOINTMENTS: AppointmentTypeId[] = [
  'warden', 'assistant_warden', 'house_parent', 'hostel_administrator',
]

/**
 * Standard guard for hostel-staff-only routes: loads the caller's
 * profile, confirms they either hold an active hostel-staff appointment
 * or are principal/secretary (same "admin can see everything at their
 * school" pattern used elsewhere), and returns what the route needs.
 * Returns null if unauthorized, caller returns 401/403.
 */
export async function requireHostelStaff(
  adminClient: SupabaseClient,
  userId: string
) {
  const { data: profile } = await adminClient
    .from('profiles')
    .select('id, role, school_id')
    .eq('id', userId)
    .single()

  if (!profile) return null

  if (profile.role === 'principal' || profile.role === 'secretary') {
    return { profile, appointment: null as null | Awaited<ReturnType<typeof getActiveAppointment>> }
  }

  const appointment = await getActiveAppointment(
    adminClient, profile.id, profile.school_id, HOSTEL_STAFF_APPOINTMENTS
  )
  if (!appointment) return null

  return { profile, appointment }
}

// -------------------------------------------------------------------------
// Below: the ICT lane's independently-built helpers. Kept alongside the
// two sections above rather than collapsed into one shape, for the same
// reason as the Hostel section: each lane's checks are tailored to what
// that lane's routes actually need. New callers should pick whichever
// shape fits, not force one pattern to cover every case.
// -------------------------------------------------------------------------

export type IctAppointment = 'ict_officer' | 'ict_administrator'

/**
 * Does this profile currently hold an active ICT appointment (officer or
 * administrator) at their own school? Principal always passes, the
 * permission matrix gives Principal full access to everything, ICT
 * included.
 *
 * Deliberately does NOT trust `profiles.role` for this, per the "one
 * user, multiple contexts" rule, ICT is an appointment a teacher (or
 * principal) holds, not a base role.
 */
export async function getIctAppointment(
  supabase: SupabaseClient,
  profileId: string,
  schoolId: string,
): Promise<IctAppointment | 'principal' | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', profileId)
    .eq('school_id', schoolId)
    .single()

  if (profile?.role === 'principal') return 'principal'

  const { data: appt } = await supabase
    .from('appointments')
    .select('appointment_type, status')
    .eq('profile_id', profileId)
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .in('appointment_type', ['ict_officer', 'ict_administrator'])
    .maybeSingle()

  if (!appt) return null
  return appt.appointment_type as IctAppointment
}

/**
 * Convenience boolean wrapper for routes that just need a yes/no gate
 * before proceeding. Use getIctAppointment directly where officer vs.
 * administrator needs to be distinguished.
 */
export async function requireIctAccess(
  supabase: SupabaseClient,
  profileId: string,
  schoolId: string,
): Promise<boolean> {
  return (await getIctAppointment(supabase, profileId, schoolId)) !== null
}

/**
 * Explicit least-privilege reminder, matching the permission matrix's
 * "Explicit exclusions" section verbatim. Nothing in this file grants
 * ICT any of these, this export exists so a future route author sees a
 * loud "no" here before being tempted to add a convenient join.
 */
export const ICT_MUST_NEVER_ACCESS = [
  'counseling_records',
  'clinic_health_records',
  'financial_records',
  'examination_results',
  'private_parent_information',
  'confidential_disciplinary_records',
] as const

// -------------------------------------------------------------------------
// Below: the §25 permission matrix (docs/phase1-foundation/03-permission-matrix.md)
// expressed as code, from the Vice Principal / Org Hierarchy lane, plus its
// server-side context resolver. This section's `requireAppointment` was
// renamed to `requireAppointmentPage` below to avoid colliding with the
// Counselor lane's `requireAppointment` above: same idea, different shape.
// The two are NOT interchangeable, one is an API-route helper that
// returns null on failure so the caller writes its own 401/403 JSON
// response, the other is a server-component page guard that redirects
// and never returns null. Pick whichever fits the file being written.
//
// Reading rule, carried over verbatim from the source table: a grant
// means "may perform this action within their own scope", never
// school-wide by default. Principal is the only subject with school-wide
// default scope. `true` = granted within scope, 'scoped' = granted but
// explicitly called out as scope-checked against the caller's
// appointment (approve/publish/assign-type actions), `false` = not
// granted, full stop.
// -------------------------------------------------------------------------

export type PermissionSubject =
  | 'principal' | 'vice_principal' | 'secretary' | 'bursar' | 'hod'
  | 'examination_officer' | 'counselor' | 'nurse' | 'librarian'
  | 'ict_officer' | 'warden' | 'coach' | 'teacher'
  | 'student_leader' | 'hostel_prefect' | 'student' | 'parent'

type Grant = true | 'scoped' | false

const FULL: Record<PermissionAction, Grant> = {
  view: true, create: true, edit: true, approve: true, publish: true,
  assign: true, export: true, delete: true, manage: true,
}
const NONE: Record<PermissionAction, Grant> = {
  view: false, create: false, edit: false, approve: false, publish: false,
  assign: false, export: false, delete: false, manage: false,
}

// Mirrors docs/phase1-foundation/03-permission-matrix.md exactly. If that
// table changes, change it here too, this is the one place Phase 2 code
// should read grants from.
export const PERMISSION_MATRIX: Record<PermissionSubject, Record<PermissionAction, Grant>> = {
  principal: FULL,
  vice_principal: {
    view: true, create: true, edit: true,
    approve: 'scoped', publish: 'scoped', assign: 'scoped',
    export: true, delete: false, manage: false,
  },
  secretary: { ...NONE, view: true, create: true, edit: true, export: true },
  bursar: { ...NONE, view: true, create: true, edit: true, export: true },
  hod: {
    ...NONE, view: true, create: true, edit: true, assign: true, export: true,
    approve: 'scoped',
  },
  examination_officer: {
    ...NONE, view: true, create: true, edit: true, approve: true, publish: true, export: true,
  },
  counselor: { ...NONE, view: true, create: true, edit: true },
  nurse: { ...NONE, view: true, create: true, edit: true },
  librarian: { ...NONE, view: true, create: true, edit: true, export: true, delete: true },
  ict_officer: { ...NONE, view: true, create: true, approve: true, manage: true },
  warden: { ...NONE, view: true, create: true, edit: true },
  coach: { ...NONE, view: true, create: true, edit: true },
  teacher: { ...NONE, view: true, create: true, edit: true, export: true },
  student_leader: { ...NONE, view: true },
  // Real duties only: assisting with roll-call attendance in their own
  // assigned hostel(s), scope-checked below via getHostelPrefectScope -
  // never incidents, leave, maintenance, or any other hostel-staff
  // action. hostel/incidents/route.ts explicitly excludes every student
  // path (including this one) by design, matched by its RLS policy -
  // that boundary is untouched here.
  hostel_prefect: { ...NONE, view: true, create: 'scoped' },
  student: { ...NONE, view: true },
  parent: { ...NONE, view: true },
}

export function can(subject: PermissionSubject, action: PermissionAction): Grant {
  return PERMISSION_MATRIX[subject][action]
}

const APPOINTMENT_TO_SUBJECT: Partial<Record<AppointmentTypeId, PermissionSubject>> = {
  vice_principal: 'vice_principal',
  hod: 'hod',
  examination_officer: 'examination_officer',
  counselor: 'counselor',
  nurse: 'nurse',
  librarian: 'librarian',
  ict_officer: 'ict_officer',
  warden: 'warden',
  coach: 'coach',
  head_boy: 'student_leader',
  head_girl: 'student_leader',
  class_prefect: 'student_leader',
  hostel_prefect: 'hostel_prefect',
}

export interface UserContext {
  userId: string
  schoolId: string
  baseRole: UserRole
  appointments: Appointment[]
}

/**
 * The one function every Phase 2 server route/page should call to find
 * out who's actually asking. Reads the caller's real profile + active
 * appointments from the database, never trusts a role/appointment
 * string supplied by the client. Returns null if there's no
 * authenticated user or no matching profile.
 */
export async function resolveUserContext(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserContext | null> {
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, school_id, role')
    .eq('id', userId)
    .single()

  if (profileErr || !profile) return null

  const { data: appointments, error: apptErr } = await supabase
    .from('appointments')
    .select('*')
    .eq('profile_id', userId)
    .eq('status', 'active')

  if (apptErr) {
    console.error('[permissions] resolveUserContext appointments error:', apptErr.message)
  }

  return {
    userId,
    schoolId: (profile as any).school_id,
    baseRole: (profile as any).role,
    appointments: (appointments ?? []) as Appointment[],
  }
}

/** The active appointment of a given type, if the caller holds one. */
export function getAppointment(ctx: UserContext, type: AppointmentTypeId): Appointment | undefined {
  return ctx.appointments.find(a => a.appointment_type === type)
}

/**
 * All permission subjects this context currently holds (base role's
 * matching subject, if any, plus one per active appointment). A user can
 * legitimately hold several at once, e.g. Teacher + HOD, per §3's
 * "union of independently granted capabilities" rule. This function
 * doesn't merge them into one grant; callers should check the specific
 * subject relevant to the action being performed, not "any subject this
 * user holds," so a Coach appointment never accidentally unlocks
 * something only the HOD subject grants.
 */
export function getSubjects(ctx: UserContext): PermissionSubject[] {
  const subjects: PermissionSubject[] = []
  if (ctx.baseRole === 'principal') subjects.push('principal')
  if (ctx.baseRole === 'secretary') subjects.push('secretary')
  if (ctx.baseRole === 'bursar') subjects.push('bursar')
  if (ctx.baseRole === 'teacher') subjects.push('teacher')
  if (ctx.baseRole === 'student') subjects.push('student')
  if (ctx.baseRole === 'parent') subjects.push('parent')
  for (const appt of ctx.appointments) {
    const subject = APPOINTMENT_TO_SUBJECT[appt.appointment_type]
    if (subject) subjects.push(subject)
  }
  return subjects
}

export interface VpDepartmentScope {
  portfolio: string | null          // e.g. "academics" | "administration" | "student_affairs" | "operations"
  departmentIds: string[]           // explicit department_ids this VP appointment authorizes
}

/**
 * Reads a Vice Principal appointment's configured scope. Scope is stored
 * in `appointments.scope` (jsonb) as { portfolio?: string, department_ids?:
 * string[] }, plus the single `appointments.department_id` column if set,
 * both are folded together here. An appointment with neither is scoped to
 * nothing: per "explicit scope only, never implied by title" (schema
 * comment on appointments.scope), that means no scoped actions (approve/
 * publish/assign) are authorized until the Principal configures it, NOT
 * that the VP falls back to school-wide access.
 */
export function getVpDepartmentScope(appt: Appointment): VpDepartmentScope {
  const scope = (appt.scope ?? {}) as { portfolio?: string; department_ids?: string[] }
  const ids = new Set<string>()
  if (appt.department_id) ids.add(appt.department_id)
  if (Array.isArray(scope.department_ids)) {
    for (const id of scope.department_ids) if (typeof id === 'string') ids.add(id)
  }
  return { portfolio: scope.portfolio ?? null, departmentIds: Array.from(ids) }
}

export interface HostelPrefectScope {
  hostelIds: string[]     // explicit hostel_ids this appointment authorizes
}

/**
 * Reads a Hostel Prefect appointment's configured scope: which hostel(s)
 * they may assist with roll call for. Stored in `appointments.scope` as
 * { hostel_ids?: string[] }, same "explicit scope only" rule as VP
 * departments - no hostel_ids means no scoped action is authorized,
 * never a fallback to every hostel at the school. Takes just the `scope`
 * field (not a full Appointment) since that's the only thing this reads -
 * callers like getActiveAppointment's partial select don't need to
 * fetch every Appointment column just to pass this check.
 */
export function getHostelPrefectScope(appt: Pick<Appointment, 'scope'>): HostelPrefectScope {
  const scope = (appt.scope ?? {}) as { hostel_ids?: string[] }
  const ids = Array.isArray(scope.hostel_ids)
    ? scope.hostel_ids.filter((id): id is string => typeof id === 'string')
    : []
  return { hostelIds: ids }
}

/**
 * Who, if anyone, may manage (create/edit/delete) objectives, tasks,
 * reports, or schedule items for a specific department. Three
 * independent paths to "yes", Principal always, Vice Principal within
 * their configured scope, HOD for their own department only, matching
 * §3's "union of independently granted capabilities... never receive
 * unrelated access merely because they hold a senior title." An HOD of
 * Science gets nothing here for Languages, even though both are
 * departments and even if they're also a teacher there.
 */
export function canManageDepartmentWork(
  ctx: UserContext,
  departmentId: string,
): 'principal' | 'vice_principal' | 'hod' | null {
  if (ctx.baseRole === 'principal') return 'principal'

  const vpAppt = getAppointment(ctx, 'vice_principal')
  if (vpAppt && getVpDepartmentScope(vpAppt).departmentIds.includes(departmentId)) {
    return 'vice_principal'
  }

  const hodAppt = getAppointment(ctx, 'hod')
  if (hodAppt && hodAppt.department_id === departmentId) {
    return 'hod'
  }

  return null
}

// ---------------------------------------------------------------------
// Page guards
// ---------------------------------------------------------------------
// Server-component convenience wrapper around resolveUserContext(), for
// pages that require a specific active appointment. Redirects (never
// renders anything on failure) so a page.tsx body only has to call this
// once at the top and can trust everything after it. API routes should
// NOT use this, they should call resolveUserContext() + getAppointment()
// directly and return a 401/403 JSON response instead of redirecting.

export async function requireAppointmentPage(appointmentType: AppointmentTypeId) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) redirect('/login')

  const appointment = getAppointment(ctx, appointmentType)
  if (!appointment) redirect('/dashboard')

  return { supabase, ctx, appointment }
}
