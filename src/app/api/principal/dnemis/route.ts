// src/app/api/principal/dnemis/route.ts
//
// Learner Identification Number (LIN) + D-NEMIS readiness for one school.
//
//   GET  ?format=csv   -> CSV export of every student (see lib/dnemis.ts)
//   GET                -> JSON { students, school, summary }
//   POST { updates: [{ student_id | admission_number, lin }] }  or  { csv: "..." }
//                      -> assign / clear LINs in bulk
//   PUT  { dnemis_school_id }   (principal only) -> save the school's 10-digit ID
//
// Security model: the caller must be a principal or secretary; the school is
// ALWAYS taken from the caller's own profile, never from the request. The
// service-role client is used only after that check and every query/update is
// scoped to the caller's school, so no RLS changes are needed for the new
// columns (see sql/migrations/2026-10-27-lin-dnemis.sql).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildDnemisCsv,
  isValidDnemisSchoolId,
  isValidLin,
  normalizeLin,
  parseLinCsv,
  type DnemisStudentRow,
} from '@/lib/dnemis'

const ALLOWED_ROLES = ['principal', 'secretary']
const MAX_UPDATES = 500
const ID_CHUNK = 200
const MIGRATION_HINT =
  'LIN support is not set up yet. Run sql/migrations/2026-10-27-lin-dnemis.sql in the Supabase SQL editor, then reload.'

type Admin = ReturnType<typeof createAdminClient>

async function getCaller() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  const role = (profile as any)?.role as string | undefined
  const schoolId = (profile as any)?.school_id as string | undefined
  if (!role || !schoolId || !ALLOWED_ROLES.includes(role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id, role, schoolId }
}

function isMissingColumn(err: { message?: string } | null | undefined): boolean {
  const m = (err?.message ?? '').toLowerCase()
  return m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache')
}

async function loadStudents(admin: Admin, schoolId: string) {
  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, full_name, gender, date_of_birth, class_level')
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .order('full_name')
  if (pErr) return { error: pErr }

  const ids = (profiles ?? []).map((p: any) => p.id as string)
  const spById = new Map<string, any>()
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data: sp, error: sErr } = await admin
      .from('student_profiles')
      .select('id, lin, admission_number, guardian_name, guardian_phone')
      .in('id', ids.slice(i, i + ID_CHUNK))
    if (sErr) return { error: sErr }
    for (const r of sp ?? []) spById.set((r as any).id, r)
  }

  const students: DnemisStudentRow[] = (profiles ?? []).map((p: any) => {
    const sp = spById.get(p.id)
    return {
      id: p.id,
      full_name: p.full_name,
      gender: p.gender ?? null,
      date_of_birth: p.date_of_birth ?? null,
      class_level: p.class_level ?? null,
      admission_number: sp?.admission_number ?? null,
      lin: sp?.lin ?? null,
      guardian_name: sp?.guardian_name ?? null,
      guardian_phone: sp?.guardian_phone ?? null,
    }
  })
  return { students }
}

async function loadSchoolDnemisId(admin: Admin, schoolId: string) {
  const { data, error } = await admin
    .from('schools')
    .select('dnemis_school_id')
    .eq('id', schoolId)
    .single()
  if (error) return { error }
  return { dnemisSchoolId: ((data as any)?.dnemis_school_id as string | null) ?? null }
}

async function audit(admin: Admin, actorId: string, action: string, schoolId: string, metadata: Record<string, unknown>) {
  try {
    await admin.from('portal_audit_log').insert({
      action,
      actor_id: actorId,
      target_table: 'student_profiles',
      target_id: null,
      metadata: { school_id: schoolId, ...metadata },
      logged_at: new Date().toISOString(),
    })
  } catch { /* non-critical */ }
}

// ── GET ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────

export async function GET(req: Request) {
  const caller = await getCaller()
  if ('error' in caller) return caller.error

  const admin = createAdminClient()
  const [studentsRes, schoolRes] = await Promise.all([
    loadStudents(admin, caller.schoolId),
    loadSchoolDnemisId(admin, caller.schoolId),
  ])

  if ('error' in studentsRes || 'error' in schoolRes) {
    const err = ('error' in studentsRes ? studentsRes.error : (schoolRes as any).error) as { message?: string }
    if (isMissingColumn(err)) {
      return NextResponse.json({ error: MIGRATION_HINT, code: 'migration_required' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load students' }, { status: 500 })
  }

  const { students } = studentsRes
  const { dnemisSchoolId } = schoolRes

  const url = new URL(req.url)
  if (url.searchParams.get('format') === 'csv') {
    const csv = buildDnemisCsv(students, dnemisSchoolId)
    const stamp = new Date().toISOString().slice(0, 10)
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="learners-dnemis-${stamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  }

  const withLin = students.filter(s => !!s.lin).length
  return NextResponse.json({
    students,
    school: { dnemis_school_id: dnemisSchoolId },
    summary: {
      total: students.length,
      withLin,
      missingLin: students.length - withLin,
      readinessPct: students.length ? Math.round((withLin / students.length) * 100) : 0,
    },
    canEditSchoolId: caller.role === 'principal',
  })
}

// ── POST: assign / clear LINs ───────────────────────────────────────────────────────────────────────────

interface UpdateIn { student_id?: string; admission_number?: string; lin?: string }
interface Failure { key: string; reason: string }

export async function POST(req: Request) {
  const caller = await getCaller()
  if ('error' in caller) return caller.error

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const failed: Failure[] = []
  let updates: UpdateIn[] = []

  if (typeof body?.csv === 'string') {
    if (body.csv.length > 200_000) return NextResponse.json({ error: 'File too large' }, { status: 413 })
    const parsed = parseLinCsv(body.csv)
    for (const e of parsed.errors) failed.push({ key: '', reason: e })
    updates = parsed.rows.map(r => ({ admission_number: r.key, lin: r.lin }))
  } else if (Array.isArray(body?.updates)) {
    updates = body.updates
  } else {
    return NextResponse.json({ error: 'Provide updates[] or csv' }, { status: 400 })
  }

  if (updates.length > MAX_UPDATES) {
    return NextResponse.json({ error: `At most ${MAX_UPDATES} updates per request` }, { status: 400 })
  }

  const admin = createAdminClient()
  const loaded = await loadStudents(admin, caller.schoolId)
  if ('error' in loaded) {
    if (isMissingColumn(loaded.error as any)) {
      return NextResponse.json({ error: MIGRATION_HINT, code: 'migration_required' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not load students' }, { status: 500 })
  }

  const byId = new Map(loaded.students.map(s => [s.id, s]))
  const byAdmission = new Map<string, DnemisStudentRow>()
  for (const s of loaded.students) {
    if (s.admission_number) byAdmission.set(s.admission_number.trim().toLowerCase(), s)
  }

  let updated = 0
  for (const u of updates) {
    const label = u.admission_number ?? u.student_id ?? '(unknown)'
    const target =
      (u.student_id ? byId.get(u.student_id) : undefined) ??
      (u.admission_number ? byAdmission.get(u.admission_number.trim().toLowerCase()) : undefined)

    // Only students of the caller's own school are ever in these maps.
    if (!target) { failed.push({ key: label, reason: 'Student not found in your school' }); continue }

    const lin = normalizeLin(u.lin)
    if (lin && !isValidLin(lin)) { failed.push({ key: label, reason: 'Not a valid LIN' }); continue }

    const { data, error } = await admin
      .from('student_profiles')
      .update({ lin: lin || null })
      .eq('id', target.id)
      .select('id')

    if (error) {
      const dup = (error as any).code === '23505'
      failed.push({ key: label, reason: dup ? 'This LIN is already assigned to another learner' : 'Could not save' })
      continue
    }
    if (!data || data.length === 0) {
      failed.push({ key: label, reason: 'Student has no student profile record' })
      continue
    }
    updated++
  }

  if (updated > 0) {
    await audit(admin, caller.userId, 'lin_updated', caller.schoolId, { updated, failed: failed.length })
  }
  return NextResponse.json({ updated, failed })
}

// ── PUT: school's 10-digit D-NEMIS ID (principal only) ───────────────────────────────────────────────────────────

export async function PUT(req: Request) {
  const caller = await getCaller()
  if ('error' in caller) return caller.error
  if (caller.role !== 'principal') {
    return NextResponse.json({ error: 'Only the principal can change the school ID' }, { status: 403 })
  }

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const raw = typeof body?.dnemis_school_id === 'string' ? body.dnemis_school_id.replace(/\s+/g, '') : ''
  if (raw && !isValidDnemisSchoolId(raw)) {
    return NextResponse.json({ error: 'The school ID is 10 digits' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('schools')
    .update({ dnemis_school_id: raw || null })
    .eq('id', caller.schoolId)

  if (error) {
    if (isMissingColumn(error as any)) {
      return NextResponse.json({ error: MIGRATION_HINT, code: 'migration_required' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Could not save' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, dnemis_school_id: raw || null })
}
