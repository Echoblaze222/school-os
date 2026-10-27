// src/app/api/principal/data-protection/[section]/route.ts
//
// NDPA compliance tools for one school. One dynamic route, four sections:
//
//   settings  GET | PUT(principal)                  DPO, NDPC registration, checklist, privacy notice
//   consents  GET | POST                            parental consent register
//   requests  GET | POST | PATCH                    data-subject request log
//   breaches  GET | POST | PATCH  (principal only)  breach register + 72h NDPC clock
//
// Security model: caller must be a principal or secretary; the school is
// ALWAYS taken from the caller's own profile, never from the request. The
// tables have RLS enabled with no policies (see
// sql/migrations/2026-10-27-ndpa-compliance.sql), so the service-role client
// used here, scoped to that school, is the only way in.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  BREACH_STATUSES,
  CONSENT_METHODS,
  CONSENT_TYPE_IDS,
  CONSENT_TYPES,
  REQUEST_STATUSES,
  REQUEST_TYPES,
  RISK_LEVELS,
  breachClock,
  buildPrivacyNotice,
  computeChecklist,
  defaultDueDate,
  isIsoDate,
  requestClock,
} from '@/lib/dataProtection'

type Admin = ReturnType<typeof createAdminClient>
type Ctx = { params: Promise<{ section: string }> }
const SECTIONS = ['settings', 'consents', 'requests', 'breaches'] as const
type Section = (typeof SECTIONS)[number]

const ALLOWED_ROLES = ['principal', 'secretary']
const MAX_CONSENT_BATCH = 500
const ID_CHUNK = 200
const MIGRATION_HINT =
  'Data protection tools are not set up yet. Run sql/migrations/2026-10-27-ndpa-compliance.sql in the Supabase SQL editor, then reload.'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function fail(err: { message?: string } | null | undefined) {
  const m = (err?.message ?? '').toLowerCase()
  if (m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache')) {
    return NextResponse.json({ error: MIGRATION_HINT, code: 'migration_required' }, { status: 503 })
  }
  console.error('data-protection route error:', err?.message)
  return bad('Something went wrong. Please try again.', 500)
}

async function getCaller() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: bad('Unauthorized', 401) }
  const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  const role = (profile as any)?.role as string | undefined
  const schoolId = (profile as any)?.school_id as string | undefined
  if (!role || !schoolId || !ALLOWED_ROLES.includes(role)) return { error: bad('Forbidden', 403) }
  return { userId: user.id, role, schoolId }
}

async function audit(admin: Admin, actorId: string, action: string, schoolId: string, table: string, metadata: Record<string, unknown> = {}) {
  try {
    await admin.from('portal_audit_log').insert({
      action, actor_id: actorId, target_table: table, target_id: null,
      metadata: { school_id: schoolId, ...metadata }, logged_at: new Date().toISOString(),
    })
  } catch { /* non-critical */ }
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function schoolStudentIds(admin: Admin, schoolId: string) {
  const { data, error } = await admin.from('profiles').select('id').eq('school_id', schoolId).eq('role', 'student')
  if (error) return { error }
  return { ids: new Set((data ?? []).map((r: any) => r.id as string)) }
}

// ── settings ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function settingsGet(admin: Admin, schoolId: string) {
  const [settingsRes, schoolRes, studentsRes, consentRes, reqRes, brRes] = await Promise.all([
    admin.from('school_data_protection').select('*').eq('school_id', schoolId).maybeSingle(),
    admin.from('schools').select('name').eq('id', schoolId).single(),
    admin.from('profiles').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('role', 'student'),
    admin.from('parental_consents').select('id', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('consent_type', 'data_processing').eq('granted', true),
    admin.from('data_subject_requests').select('status, due_on').eq('school_id', schoolId).in('status', ['open', 'in_progress']),
    admin.from('data_breach_register').select('discovered_at, ndpc_notified_at').eq('school_id', schoolId).is('ndpc_notified_at', null),
  ])

  const firstErr = settingsRes.error ?? studentsRes.error ?? consentRes.error ?? reqRes.error ?? brRes.error
  if (firstErr) return fail(firstErr)

  const settings = (settingsRes.data as any) ?? null
  const now = new Date()
  const overdueRequests = (reqRes.data ?? []).filter((r: any) => requestClock(r, now).state === 'overdue').length
  const overdueBreaches = (brRes.data ?? []).filter((b: any) => breachClock(b, now).state === 'overdue').length

  const checklist = computeChecklist({
    settings,
    studentCount: studentsRes.count ?? 0,
    consentedStudents: consentRes.count ?? 0,
    overdueRequests,
    overdueBreaches,
    now,
  })

  const schoolName = ((schoolRes.data as any)?.name as string | undefined) ?? 'Our school'
  return NextResponse.json({
    settings,
    schoolName,
    checklist,
    privacyNotice: buildPrivacyNotice({
      schoolName,
      dpoName: settings?.dpo_name,
      dpoEmail: settings?.dpo_email,
      dpoPhone: settings?.dpo_phone,
      ndpcRegistrationNumber: settings?.ndpc_registration_number,
    }),
  })
}

async function settingsPut(admin: Admin, caller: { userId: string; schoolId: string }, body: any) {
  const email = str(body?.dpo_email, 200)
  if (email && !EMAIL_RE.test(email)) return bad('DPO email is not valid')

  let year: number | null = null
  if (body?.last_audit_return_year !== null && body?.last_audit_return_year !== undefined && body?.last_audit_return_year !== '') {
    year = Number(body.last_audit_return_year)
    if (!Number.isInteger(year) || year < 2023 || year > new Date().getUTCFullYear()) return bad('Audit return year is not valid')
  }

  const dates: Record<string, string | null> = {}
  for (const k of ['last_audit_return_filed_on', 'privacy_notice_published_on'] as const) {
    const v = body?.[k]
    if (v === null || v === undefined || v === '') { dates[k] = null; continue }
    if (!isIsoDate(v)) return bad('Dates must look like 2026-10-27')
    dates[k] = v
  }

  const row = {
    school_id: caller.schoolId,
    dpo_name: str(body?.dpo_name, 200),
    dpo_email: email,
    dpo_phone: str(body?.dpo_phone, 40),
    ndpc_registration_number: str(body?.ndpc_registration_number, 100),
    last_audit_return_year: year,
    ...dates,
    updated_by: caller.userId,
    updated_at: new Date().toISOString(),
  }
  const { error } = await admin.from('school_data_protection').upsert(row, { onConflict: 'school_id' })
  if (error) return fail(error)
  await audit(admin, caller.userId, 'dp_settings_updated', caller.schoolId, 'school_data_protection')
  return NextResponse.json({ ok: true })
}

// ── consents ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function consentsGet(admin: Admin, schoolId: string) {
  const { data: students, error: sErr } = await admin
    .from('profiles').select('id, full_name, class_level')
    .eq('school_id', schoolId).eq('role', 'student').order('full_name')
  if (sErr) return fail(sErr)

  const { data: rows, error: cErr } = await admin
    .from('parental_consents').select('student_id, consent_type, granted, recorded_at')
    .eq('school_id', schoolId)
  if (cErr) return fail(cErr)

  const map: Record<string, Record<string, boolean>> = {}
  for (const r of rows ?? []) {
    ;(map[(r as any).student_id] ??= {})[(r as any).consent_type] = (r as any).granted
  }

  const total = students?.length ?? 0
  const summary: Record<string, { granted: number; declined: number; notRecorded: number }> = {}
  for (const t of CONSENT_TYPES) {
    let granted = 0, declined = 0
    for (const s of students ?? []) {
      const v = map[(s as any).id]?.[t.id]
      if (v === true) granted++
      else if (v === false) declined++
    }
    summary[t.id] = { granted, declined, notRecorded: total - granted - declined }
  }
  return NextResponse.json({ students: students ?? [], consents: map, summary })
}

async function consentsPost(admin: Admin, caller: { userId: string; schoolId: string }, body: any) {
  const ids: unknown = body?.student_ids
  if (!Array.isArray(ids) || ids.length === 0) return bad('Select at least one learner')
  if (ids.length > MAX_CONSENT_BATCH) return bad(`At most ${MAX_CONSENT_BATCH} learners at a time`)
  if (!CONSENT_TYPE_IDS.includes(body?.consent_type)) return bad('Unknown consent type')
  if (typeof body?.granted !== 'boolean') return bad('granted must be true or false')
  const method = body?.method ?? 'paper'
  if (!(CONSENT_METHODS as readonly string[]).includes(method)) return bad('Unknown method')

  const school = await schoolStudentIds(admin, caller.schoolId)
  if ('error' in school) return fail(school.error)

  const valid = [...new Set(ids.filter((x): x is string => typeof x === 'string'))].filter(id => school.ids.has(id))
  const skipped = ids.length - valid.length
  if (valid.length === 0) return bad('None of the selected learners belong to your school')

  const now = new Date().toISOString()
  const rows = valid.map(student_id => ({
    school_id: caller.schoolId,
    student_id,
    consent_type: body.consent_type,
    granted: body.granted,
    method,
    guardian_name: str(body?.guardian_name, 200),
    notes: str(body?.notes, 1000),
    recorded_by: caller.userId,
    recorded_at: now,
  }))

  for (let i = 0; i < rows.length; i += ID_CHUNK) {
    const { error } = await admin.from('parental_consents').upsert(rows.slice(i, i + ID_CHUNK), { onConflict: 'student_id,consent_type' })
    if (error) return fail(error)
  }
  await audit(admin, caller.userId, 'consent_recorded', caller.schoolId, 'parental_consents', {
    consent_type: body.consent_type, granted: body.granted, count: valid.length,
  })
  return NextResponse.json({ saved: valid.length, skipped })
}

// ── requests ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function requestsGet(admin: Admin, schoolId: string) {
  const { data, error } = await admin
    .from('data_subject_requests').select('*')
    .eq('school_id', schoolId).order('created_at', { ascending: false }).limit(200)
  if (error) return fail(error)

  const studentIds = [...new Set((data ?? []).map((r: any) => r.student_id).filter(Boolean))] as string[]
  const names = new Map<string, string>()
  for (let i = 0; i < studentIds.length; i += ID_CHUNK) {
    const { data: ps } = await admin.from('profiles').select('id, full_name').in('id', studentIds.slice(i, i + ID_CHUNK))
    for (const p of ps ?? []) names.set((p as any).id, (p as any).full_name)
  }

  const now = new Date()
  const requests = (data ?? []).map((r: any) => ({
    ...r,
    student_name: r.student_id ? names.get(r.student_id) ?? null : null,
    clock: requestClock(r, now),
  }))
  return NextResponse.json({ requests })
}

async function requestsPost(admin: Admin, caller: { userId: string; schoolId: string }, body: any) {
  const name = str(body?.requester_name, 200)
  if (!name) return bad('Requester name is required')
  if (!(REQUEST_TYPES as readonly string[]).includes(body?.request_type)) return bad('Unknown request type')

  let studentId: string | null = null
  if (body?.student_id) {
    const school = await schoolStudentIds(admin, caller.schoolId)
    if ('error' in school) return fail(school.error)
    if (!school.ids.has(body.student_id)) return bad('Learner not found in your school')
    studentId = body.student_id
  }

  const received = body?.received_on ? body.received_on : new Date().toISOString().slice(0, 10)
  if (!isIsoDate(received)) return bad('Received date is not valid')
  const due = body?.due_on ? body.due_on : defaultDueDate(new Date(received))
  if (!isIsoDate(due)) return bad('Due date is not valid')

  const { error } = await admin.from('data_subject_requests').insert({
    school_id: caller.schoolId,
    requester_name: name,
    requester_contact: str(body?.requester_contact, 200),
    student_id: studentId,
    request_type: body.request_type,
    details: str(body?.details, 2000),
    received_on: received,
    due_on: due,
    created_by: caller.userId,
  })
  if (error) return fail(error)
  await audit(admin, caller.userId, 'dsr_created', caller.schoolId, 'data_subject_requests', { request_type: body.request_type })
  return NextResponse.json({ ok: true })
}

async function requestsPatch(admin: Admin, caller: { userId: string; schoolId: string }, body: any) {
  if (typeof body?.id !== 'string') return bad('id is required')
  const patch: Record<string, unknown> = {}
  if (body.status !== undefined) {
    if (!(REQUEST_STATUSES as readonly string[]).includes(body.status)) return bad('Unknown status')
    patch.status = body.status
    patch.resolved_at = body.status === 'completed' || body.status === 'rejected' ? new Date().toISOString() : null
  }
  if (body.resolution_notes !== undefined) patch.resolution_notes = str(body.resolution_notes, 2000)
  if (body.due_on !== undefined) {
    if (!isIsoDate(body.due_on)) return bad('Due date is not valid')
    patch.due_on = body.due_on
  }
  if (Object.keys(patch).length === 0) return bad('Nothing to update')

  const { data, error } = await admin.from('data_subject_requests').update(patch)
    .eq('id', body.id).eq('school_id', caller.schoolId).select('id')
  if (error) return fail(error)
  if (!data || data.length === 0) return bad('Request not found', 404)
  await audit(admin, caller.userId, 'dsr_updated', caller.schoolId, 'data_subject_requests', { status: body.status })
  return NextResponse.json({ ok: true })
}

// ── breaches (principal only) ──────────────────────────────────────────────────────────────────────────────────────────────

async function breachesGet(admin: Admin, schoolId: string) {
  const { data, error } = await admin
    .from('data_breach_register').select('*')
    .eq('school_id', schoolId).order('discovered_at', { ascending: false }).limit(200)
  if (error) return fail(error)
  const now = new Date()
  const breaches = (data ?? []).map((b: any) => {
    const c = breachClock(b, now)
    return { ...b, clock: { state: c.state, hoursRemaining: c.hoursRemaining, deadline: c.deadline.toISOString() } }
  })
  return NextResponse.json({ breaches })
}

async function breachesPost(admin: Admin, caller: { userId: string; schoolId: string }, body: any) {
  const description = str(body?.description, 4000)
  if (!description) return bad('Describe what happened')
  const risk = body?.risk_level ?? 'medium'
  if (!(RISK_LEVELS as readonly string[]).includes(risk)) return bad('Unknown risk level')

  const parseTs = (v: unknown): string | null | 'bad' => {
    if (v === undefined || v === null || v === '') return null
    const t = Date.parse(String(v))
    return Number.isNaN(t) ? 'bad' : new Date(t).toISOString()
  }
  const discovered = parseTs(body?.discovered_at)
  const occurred = parseTs(body?.occurred_at)
  if (discovered === 'bad' || occurred === 'bad') return bad('Dates are not valid')

  let people: number | null = null
  if (body?.people_affected !== undefined && body?.people_affected !== null && body?.people_affected !== '') {
    people = Number(body.people_affected)
    if (!Number.isInteger(people) || people < 0) return bad('People affected must be a whole number')
  }

  const { error } = await admin.from('data_breach_register').insert({
    school_id: caller.schoolId,
    description,
    data_affected: str(body?.data_affected, 2000),
    people_affected: people,
    risk_level: risk,
    actions_taken: str(body?.actions_taken, 4000),
    discovered_at: discovered ?? new Date().toISOString(),
    occurred_at: occurred,
    created_by: caller.userId,
  })
  if (error) return fail(error)
  await audit(admin, caller.userId, 'breach_logged', caller.schoolId, 'data_breach_register', { risk_level: risk })
  return NextResponse.json({ ok: true })
}

async function breachesPatch(admin: Admin, caller: { userId: string; schoolId: string }, body: any) {
  if (typeof body?.id !== 'string') return bad('id is required')
  const patch: Record<string, unknown> = {}
  if (body.ndpc_notified === true) patch.ndpc_notified_at = new Date().toISOString()
  if (body.individuals_notified === true) patch.individuals_notified_at = new Date().toISOString()
  if (body.status !== undefined) {
    if (!(BREACH_STATUSES as readonly string[]).includes(body.status)) return bad('Unknown status')
    patch.status = body.status
  }
  if (body.actions_taken !== undefined) patch.actions_taken = str(body.actions_taken, 4000)
  if (Object.keys(patch).length === 0) return bad('Nothing to update')

  const { data, error } = await admin.from('data_breach_register').update(patch)
    .eq('id', body.id).eq('school_id', caller.schoolId).select('id')
  if (error) return fail(error)
  if (!data || data.length === 0) return bad('Breach record not found', 404)
  await audit(admin, caller.userId, 'breach_updated', caller.schoolId, 'data_breach_register', {
    ndpc_notified: body.ndpc_notified === true, status: body.status,
  })
  return NextResponse.json({ ok: true })
}

// ── dispatch ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

async function handle(req: Request, ctx: Ctx, method: 'GET' | 'POST' | 'PUT' | 'PATCH') {
  const { section } = await ctx.params
  if (!(SECTIONS as readonly string[]).includes(section)) return bad('Not found', 404)

  const caller = await getCaller()
  if ('error' in caller) return caller.error

  const principalOnly = section === 'breaches' || (section === 'settings' && method !== 'GET')
  if (principalOnly && caller.role !== 'principal') return bad('Only the principal can do this', 403)

  const admin = createAdminClient()

  let body: any = null
  if (method !== 'GET') {
    try { body = await req.json() } catch { return bad('Invalid JSON') }
  }

  switch (section as Section) {
    case 'settings':
      if (method === 'GET') return settingsGet(admin, caller.schoolId)
      if (method === 'PUT') return settingsPut(admin, caller, body)
      break
    case 'consents':
      if (method === 'GET') return consentsGet(admin, caller.schoolId)
      if (method === 'POST') return consentsPost(admin, caller, body)
      break
    case 'requests':
      if (method === 'GET') return requestsGet(admin, caller.schoolId)
      if (method === 'POST') return requestsPost(admin, caller, body)
      if (method === 'PATCH') return requestsPatch(admin, caller, body)
      break
    case 'breaches':
      if (method === 'GET') return breachesGet(admin, caller.schoolId)
      if (method === 'POST') return breachesPost(admin, caller, body)
      if (method === 'PATCH') return breachesPatch(admin, caller, body)
      break
  }
  return bad('Method not allowed', 405)
}

export const GET   = (req: Request, ctx: Ctx) => handle(req, ctx, 'GET')
export const POST  = (req: Request, ctx: Ctx) => handle(req, ctx, 'POST')
export const PUT   = (req: Request, ctx: Ctx) => handle(req, ctx, 'PUT')
export const PATCH = (req: Request, ctx: Ctx) => handle(req, ctx, 'PATCH')
