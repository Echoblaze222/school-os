// src/lib/supabase/departmentWork.ts
//
// Objectives, tasks, reports, and schedule items for a department (§3),
// plus a computed performance indicator. Every write function takes an
// already-resolved UserContext and calls canManageDepartmentWork() itself
// - callers don't get to decide who's allowed, same discipline as
// appointments.ts.
//
// Reads use the caller's regular client (RLS is same-school-open for all
// four tables, matching departments/appointments). Writes use the
// service-role client, since none of the four tables have an insert/
// update/delete RLS policy by design - see department-work-additions.sql.

import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from './admin'
import { auditLog } from '../auditLog'
import { canManageDepartmentWork, type UserContext } from '../permissions'
import { PermissionError } from './appointments'

async function assertCanManage(admin: SupabaseClient, ctx: UserContext, departmentId: string) {
  const { data: dept } = await admin.from('departments').select('id, school_id').eq('id', departmentId).single()
  if (!dept || dept.school_id !== ctx.schoolId) throw new PermissionError('Department not found.')

  const grant = canManageDepartmentWork(ctx, departmentId)
  if (!grant) {
    throw new PermissionError(
      "You don't have permission to manage this department. This is limited to the Principal, a Vice Principal whose scope includes it, or its own Head of Department.",
    )
  }
  return grant
}

// ---------------------------------------------------------------------
// Objectives
// ---------------------------------------------------------------------

export interface DepartmentObjective {
  id: string; department_id: string; title: string; description: string | null
  status: 'not_started' | 'in_progress' | 'completed'; target_date: string | null
  created_by: string | null; created_at: string; updated_at: string
}

export async function listObjectives(supabase: SupabaseClient, departmentId: string): Promise<DepartmentObjective[]> {
  const { data, error } = await supabase
    .from('department_objectives').select('*').eq('department_id', departmentId)
    .order('created_at', { ascending: false })
  if (error) { console.error('[departmentWork] listObjectives:', error.message); return [] }
  return data ?? []
}

export async function createObjective(
  ctx: UserContext, departmentId: string,
  input: { title: string; description?: string; target_date?: string | null },
): Promise<DepartmentObjective> {
  const admin = createAdminClient()
  await assertCanManage(admin, ctx, departmentId)
  const { data, error } = await admin.from('department_objectives').insert({
    school_id: ctx.schoolId, department_id: departmentId,
    title: input.title.trim(), description: input.description?.trim() || null,
    target_date: input.target_date || null, created_by: ctx.userId,
  }).select('*').single()
  if (error) throw new Error(`Could not create objective: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_objective.create', targetTable: 'department_objectives', targetId: data.id, metadata: { department_id: departmentId, title: input.title } })
  return data
}

export async function updateObjective(
  ctx: UserContext, departmentId: string, objectiveId: string,
  input: Partial<{ title: string; description: string | null; status: DepartmentObjective['status']; target_date: string | null }>,
): Promise<void> {
  const admin = createAdminClient()
  await assertCanManage(admin, ctx, departmentId)
  const { error } = await admin.from('department_objectives')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', objectiveId).eq('department_id', departmentId)
  if (error) throw new Error(`Could not update objective: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_objective.update', targetTable: 'department_objectives', targetId: objectiveId, metadata: input })
}

export async function deleteObjective(ctx: UserContext, departmentId: string, objectiveId: string): Promise<void> {
  const admin = createAdminClient()
  await assertCanManage(admin, ctx, departmentId)
  const { error } = await admin.from('department_objectives').delete().eq('id', objectiveId).eq('department_id', departmentId)
  if (error) throw new Error(`Could not delete objective: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_objective.delete', targetTable: 'department_objectives', targetId: objectiveId })
}

// ---------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------

export interface DepartmentTask {
  id: string; department_id: string; title: string; description: string | null
  assigned_to: string | null; status: 'todo' | 'in_progress' | 'done'; due_date: string | null
  created_by: string | null; created_at: string; updated_at: string
  assignee?: { id: string; full_name: string } | null
}

export async function listTasks(supabase: SupabaseClient, departmentId: string): Promise<DepartmentTask[]> {
  const { data, error } = await supabase
    .from('department_tasks').select('*, assignee:assigned_to(id, full_name)').eq('department_id', departmentId)
    .order('due_date', { ascending: true, nullsFirst: false })
  if (error) { console.error('[departmentWork] listTasks:', error.message); return [] }
  return (data ?? []).map((t: any) => ({ ...t, assignee: Array.isArray(t.assignee) ? t.assignee[0] ?? null : t.assignee }))
}

export async function createTask(
  ctx: UserContext, departmentId: string,
  input: { title: string; description?: string; assigned_to?: string | null; due_date?: string | null },
): Promise<DepartmentTask> {
  const admin = createAdminClient()
  await assertCanManage(admin, ctx, departmentId)

  if (input.assigned_to) {
    const { data: assignee } = await admin.from('profiles').select('id, school_id, department_id').eq('id', input.assigned_to).single()
    if (!assignee || assignee.school_id !== ctx.schoolId) throw new PermissionError('Assignee not found.')
  }

  const { data, error } = await admin.from('department_tasks').insert({
    school_id: ctx.schoolId, department_id: departmentId,
    title: input.title.trim(), description: input.description?.trim() || null,
    assigned_to: input.assigned_to || null, due_date: input.due_date || null, created_by: ctx.userId,
  }).select('*').single()
  if (error) throw new Error(`Could not create task: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_task.create', targetTable: 'department_tasks', targetId: data.id, metadata: { department_id: departmentId, title: input.title } })
  return data
}

export async function updateTask(
  ctx: UserContext, departmentId: string, taskId: string,
  input: Partial<{ title: string; description: string | null; assigned_to: string | null; status: DepartmentTask['status']; due_date: string | null }>,
): Promise<void> {
  const admin = createAdminClient()
  await assertCanManage(admin, ctx, departmentId)
  const { error } = await admin.from('department_tasks')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', taskId).eq('department_id', departmentId)
  if (error) throw new Error(`Could not update task: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_task.update', targetTable: 'department_tasks', targetId: taskId, metadata: input })
}

export async function deleteTask(ctx: UserContext, departmentId: string, taskId: string): Promise<void> {
  const admin = createAdminClient()
  await assertCanManage(admin, ctx, departmentId)
  const { error } = await admin.from('department_tasks').delete().eq('id', taskId).eq('department_id', departmentId)
  if (error) throw new Error(`Could not delete task: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_task.delete', targetTable: 'department_tasks', targetId: taskId })
}

// ---------------------------------------------------------------------
// Reports (HOD -> senior leadership escalation)
// ---------------------------------------------------------------------

export interface DepartmentReport {
  id: string; department_id: string; title: string; body: string; period: string | null
  status: 'submitted' | 'acknowledged'; submitted_by: string | null
  acknowledged_by: string | null; acknowledged_at: string | null; created_at: string
  submitter?: { id: string; full_name: string } | null
}

export async function listReports(supabase: SupabaseClient, departmentId: string): Promise<DepartmentReport[]> {
  const { data, error } = await supabase
    .from('department_reports').select('*, submitter:submitted_by(id, full_name)').eq('department_id', departmentId)
    .order('created_at', { ascending: false })
  if (error) { console.error('[departmentWork] listReports:', error.message); return [] }
  return (data ?? []).map((r: any) => ({ ...r, submitter: Array.isArray(r.submitter) ? r.submitter[0] ?? null : r.submitter }))
}

/**
 * Submitting a report is deliberately not gated by canManageDepartmentWork
 * alone - an HOD writing a report about their own department is the
 * normal case, but so is a department member drafting one for the HOD to
 * send up. What IS required either way: real management authority over
 * this department, or genuine membership in it (profiles.department_id
 * matches). Without that second check, any authenticated user at the
 * school - including a student or parent, whose role isn't checked at
 * all above this function - could write into an administrative reporting
 * channel for a department they have nothing to do with.
 */
export async function submitReport(
  ctx: UserContext, departmentId: string,
  input: { title: string; body: string; period?: string },
): Promise<DepartmentReport> {
  const admin = createAdminClient()
  const { data: dept } = await admin.from('departments').select('id, school_id').eq('id', departmentId).single()
  if (!dept || dept.school_id !== ctx.schoolId) throw new PermissionError('Department not found.')

  const hasManageGrant = !!canManageDepartmentWork(ctx, departmentId)
  if (!hasManageGrant) {
    const { data: caller } = await admin.from('profiles').select('department_id').eq('id', ctx.userId).single()
    if (caller?.department_id !== departmentId) {
      throw new PermissionError('Only members of this department, its Head of Department, a Vice Principal whose scope includes it, or the Principal can submit a report for it.')
    }
  }

  const { data, error } = await admin.from('department_reports').insert({
    school_id: ctx.schoolId, department_id: departmentId,
    title: input.title.trim(), body: input.body.trim(), period: input.period?.trim() || null,
    submitted_by: ctx.userId,
  }).select('*').single()
  if (error) throw new Error(`Could not submit report: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_report.submit', targetTable: 'department_reports', targetId: data.id, metadata: { department_id: departmentId, title: input.title } })
  return data
}

/** Acknowledging (closing the escalation loop) is the senior-leadership action - same grant as managing the department. */
export async function acknowledgeReport(ctx: UserContext, departmentId: string, reportId: string): Promise<void> {
  const admin = createAdminClient()
  const grant = await assertCanManage(admin, ctx, departmentId)
  if (grant === 'hod') throw new PermissionError('A report is acknowledged by senior leadership, not by the department that submitted it.')

  const { error } = await admin.from('department_reports')
    .update({ status: 'acknowledged', acknowledged_by: ctx.userId, acknowledged_at: new Date().toISOString() })
    .eq('id', reportId).eq('department_id', departmentId)
  if (error) throw new Error(`Could not acknowledge report: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_report.acknowledge', targetTable: 'department_reports', targetId: reportId })
}

// ---------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------

export interface DepartmentScheduleItem {
  id: string; department_id: string; title: string
  day_of_week: number | null; specific_date: string | null
  start_time: string | null; end_time: string | null; location: string | null
  created_by: string | null; created_at: string
}

export async function listSchedule(supabase: SupabaseClient, departmentId: string): Promise<DepartmentScheduleItem[]> {
  const { data, error } = await supabase
    .from('department_schedule_items').select('*').eq('department_id', departmentId)
    .order('day_of_week', { ascending: true, nullsFirst: false })
  if (error) { console.error('[departmentWork] listSchedule:', error.message); return [] }
  return data ?? []
}

export async function createScheduleItem(
  ctx: UserContext, departmentId: string,
  input: { title: string; day_of_week?: number | null; specific_date?: string | null; start_time?: string | null; end_time?: string | null; location?: string },
): Promise<DepartmentScheduleItem> {
  const admin = createAdminClient()
  await assertCanManage(admin, ctx, departmentId)
  if (input.day_of_week == null && !input.specific_date) {
    throw new PermissionError('Set either a repeating day or a specific date for this schedule item.')
  }
  const { data, error } = await admin.from('department_schedule_items').insert({
    school_id: ctx.schoolId, department_id: departmentId, title: input.title.trim(),
    day_of_week: input.day_of_week ?? null, specific_date: input.specific_date || null,
    start_time: input.start_time || null, end_time: input.end_time || null,
    location: input.location?.trim() || null, created_by: ctx.userId,
  }).select('*').single()
  if (error) throw new Error(`Could not create schedule item: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_schedule.create', targetTable: 'department_schedule_items', targetId: data.id, metadata: { department_id: departmentId, title: input.title } })
  return data
}

export async function deleteScheduleItem(ctx: UserContext, departmentId: string, itemId: string): Promise<void> {
  const admin = createAdminClient()
  await assertCanManage(admin, ctx, departmentId)
  const { error } = await admin.from('department_schedule_items').delete().eq('id', itemId).eq('department_id', departmentId)
  if (error) throw new Error(`Could not delete schedule item: ${error.message}`)
  await auditLog(admin, { actorId: ctx.userId, action: 'department_schedule.delete', targetTable: 'department_schedule_items', targetId: itemId })
}

// ---------------------------------------------------------------------
// Performance indicator (computed, not stored - see the SQL migration's
// header comment for why)
// ---------------------------------------------------------------------

export interface DepartmentPerformance {
  averageScorePercent: number | null
  resultCount: number
  subjectCount: number
}

/**
 * Average result score across every subject that belongs to this
 * department (subjects.department_id), normalised to a percentage. A
 * department with no subjects assigned yet returns nulls rather than 0 -
 * 0% would misleadingly read as "failing" instead of "no data."
 */
export async function getDepartmentPerformance(
  supabase: SupabaseClient, schoolId: string, departmentId: string,
): Promise<DepartmentPerformance> {
  const { data: subjects } = await supabase.from('subjects').select('id').eq('school_id', schoolId).eq('department_id', departmentId)
  const subjectIds = (subjects ?? []).map((s: any) => s.id)
  if (subjectIds.length === 0) return { averageScorePercent: null, resultCount: 0, subjectCount: 0 }

  const { data: classSubjects } = await supabase.from('class_subjects').select('id').in('subject_id', subjectIds)
  const classSubjectIds = (classSubjects ?? []).map((cs: any) => cs.id)
  if (classSubjectIds.length === 0) return { averageScorePercent: null, resultCount: 0, subjectCount: subjectIds.length }

  const { data: results } = await supabase
    .from('results').select('score, max_score').eq('school_id', schoolId)
    .in('class_subject_id', classSubjectIds).limit(1000)

  const scores = (results ?? [])
    .map((r: any) => (r.score != null && r.max_score ? (r.score / r.max_score) * 100 : null))
    .filter((s: any): s is number => typeof s === 'number' && !isNaN(s))

  return {
    averageScorePercent: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
    resultCount: scores.length,
    subjectCount: subjectIds.length,
  }
}
