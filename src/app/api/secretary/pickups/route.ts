// src/app/api/secretary/pickups/route.ts
//
// Front-desk gate check for authorised pickup.
//
//   GET  ?q=name                -> find learners in this school
//   GET  ?student_id=           -> who may collect them (no codes) + today's log
//   POST { action: 'verify',  student_id, code }                      -> does the code match?
//   POST { action: 'release', student_id, authorized_pickup_id, code } -> re-verifies, logs, tells the parents
//   POST { action: 'deny',    student_id, person_name?, notes? }       -> logs a refusal
//
// Security: secretary or principal only, school from the caller's profile,
// every student id checked against that school. Wrong codes are logged and
// lock the child's check for 15 minutes after 5 failures. 'release' re-checks
// the code server-side so it can't be called without it.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  LOCKOUT_MINUTES, MAX_FAILED_ATTEMPTS,
  getPickupSecret, isLockedOut, isValidPickupCode, normalizePickupCode, pickupCodeMatches,
} from '@/lib/pickupCode'

type Admin = ReturnType<typeof createAdminClient>
const ALLOWED_ROLES = ['secretary', 'principal']
const MIGRATION_HINT =
  'Pickup authorisation is not set up yet. Run sql/migrations/2026-10-27-pickup-authorisation.sql in the Supabase SQL editor, then reload.'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function fail(err: { message?: string } | null | undefined) {
  const m = (err?.message ?? '').toLowerCase()
  if (m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache')) {
    return NextResponse.json({ error: MIGRATION_HINT, code: 'migration_required' }, { status: 503 })
  }
  console.error('secretary pickups error:', err?.message)
  return bad('Something went wrong. Please try again.', 500)
}

async function getStaff() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: bad('Unauthorized', 401) }
  const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  const role = (profile as any)?.role as string | undefined
  const schoolId = (profile as any)?.school_id as string | undefined
  if (!role || !schoolId || !ALLOWED_ROLES.includes(role)) return { error: bad('Forbidden', 403) }
  return { userId: user.id, schoolId }
}

async function getStudent(admin: Admin, studentId: string, schoolId: string) {
  if (!studentId) return null
  const { data } = await admin.from('profiles').select('id, full_name, class_level')
    .eq('id', studentId).eq('school_id', schoolId).eq('role', 'student').maybeSingle()
  return (data as { id: string; full_name: string; class_level: string | null } | null) ?? null
}

const todayStr = () => new Date().toISOString().slice(0, 10)

async function activePeople(admin: Admin, studentId: string, schoolId: string) {
  const { data, error } = await admin
    .from('authorized_pickups')
    .select('id, person_name, relationship, phone, valid_until, code_hash')
    .eq('student_id', studentId).eq('school_id', schoolId).eq('active', true)
  if (error) return { error }
  const today = todayStr()
  return { people: (data ?? []).filter((p: any) => !p.valid_until || p.valid_until >= today) as any[] }
}

async function logEvent(admin: Admin, row: Record<string, unknown>) {
  const { error } = await admin.from('pickup_log').insert(row)
  if (error) console.error('pickup_log insert failed:', error.message)
}

export async function GET(req: Request) {
  const staff = await getStaff()
  if ('error' in staff) return staff.error
  const admin = createAdminClient()
  const url = new URL(req.url)

  const studentId = url.searchParams.get('student_id')
  if (studentId) {
    const student = await getStudent(admin, studentId, staff.schoolId)
    if (!student) return bad('Learner not found', 404)
    const res = await activePeople(admin, studentId, staff.schoolId)
    if ('error' in res) return fail(res.error)

    const startOfDay = new Date(); startOfDay.setUTCHours(0, 0, 0, 0)
    const { data: log, error: lErr } = await admin
      .from('pickup_log').select('id, person_name, relationship, outcome, notes, created_at')
      .eq('student_id', studentId).eq('school_id', staff.schoolId)
      .gte('created_at', startOfDay.toISOString()).order('created_at', { ascending: false }).limit(20)
    if (lErr) return fail(lErr)

    return NextResponse.json({
      student,
      people: res.people.map(({ code_hash, ...p }) => p),
      today: log ?? [],
    })
  }

  const q = (url.searchParams.get('q') ?? '').replace(/[%_,()\\]/g, ' ').trim()
  if (q.length < 2) return NextResponse.json({ students: [] })
  const { data, error } = await admin
    .from('profiles').select('id, full_name, class_level')
    .eq('school_id', staff.schoolId).eq('role', 'student')
    .ilike('full_name', `%${q}%`).order('full_name').limit(15)
  if (error) return fail(error)
  return NextResponse.json({ students: data ?? [] })
}

export async function POST(req: Request) {
  const staff = await getStaff()
  if ('error' in staff) return staff.error
  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }

  const admin = createAdminClient()
  const student = await getStudent(admin, String(body?.student_id ?? ''), staff.schoolId)
  if (!student) return bad('Learner not found', 404)
  const action = body?.action

  // ── deny ──
  if (action === 'deny') {
    await logEvent(admin, {
      school_id: staff.schoolId, student_id: student.id, outcome: 'denied',
      person_name: typeof body?.person_name === 'string' ? body.person_name.trim().slice(0, 120) || null : null,
      notes: typeof body?.notes === 'string' ? body.notes.trim().slice(0, 500) || null : null,
      verified_by: staff.userId,
    })
    return NextResponse.json({ ok: true })
  }

  if (action !== 'verify' && action !== 'release') return bad('Unknown action')

  const code = normalizePickupCode(body?.code)
  if (!isValidPickupCode(code)) return bad('Enter the 6-digit code')

  let secret: string
  try { secret = getPickupSecret() } catch { return bad('Pickup codes are not configured on this server', 500) }

  // Lockout: too many recent wrong codes for this child.
  const since = new Date(Date.now() - LOCKOUT_MINUTES * 60 * 1000).toISOString()
  const { data: fails, error: fErr } = await admin
    .from('pickup_log').select('created_at')
    .eq('student_id', student.id).eq('outcome', 'failed_code').gte('created_at', since)
  if (fErr) return fail(fErr)
  if (isLockedOut((fails ?? []).map((f: any) => f.created_at))) {
    return bad(`Too many wrong codes. Try again in ${LOCKOUT_MINUTES} minutes, or deal with this in person.`, 429)
  }

  const res = await activePeople(admin, student.id, staff.schoolId)
  if ('error' in res) return fail(res.error)

  const candidates = action === 'release'
    ? res.people.filter(p => p.id === body?.authorized_pickup_id)
    : res.people
  const match = candidates.find(p => pickupCodeMatches(code, p.id, p.code_hash, secret))

  if (!match) {
    await logEvent(admin, {
      school_id: staff.schoolId, student_id: student.id, outcome: 'failed_code', verified_by: staff.userId,
    })
    const used = (fails?.length ?? 0) + 1
    return NextResponse.json(
      { error: 'That code does not match an authorised person.', attemptsLeft: Math.max(0, MAX_FAILED_ATTEMPTS - used) },
      { status: 404 },
    )
  }

  const person = { id: match.id, person_name: match.person_name, relationship: match.relationship, phone: match.phone }
  if (action === 'verify') return NextResponse.json({ match: person })

  // ── release ──
  await logEvent(admin, {
    school_id: staff.schoolId, student_id: student.id, authorized_pickup_id: match.id,
    person_name: match.person_name, relationship: match.relationship,
    outcome: 'released', verified_by: staff.userId,
  })

  // Best-effort: tell the child's parents. Never blocks the release.
  try {
    const { data: links } = await admin.from('parent_student_links').select('parent_id').eq('student_id', student.id)
    const parentIds = [...new Set((links ?? []).map((l: any) => l.parent_id as string))]
    if (parentIds.length > 0) {
      const time = new Date().toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })
      await admin.from('notifications').insert(parentIds.map(user_id => ({
        user_id,
        school_id: staff.schoolId,
        type: 'general',
        title: 'Pickup recorded',
        body: `${student.full_name} was collected by ${match.person_name} (${match.relationship}) at ${time}.`,
        action_url: '/dashboard/parent/pickups',
        is_read: false,
      })))
    }
  } catch (e: any) {
    console.error('pickup notification failed:', e?.message)
  }

  return NextResponse.json({ released: true, person })
}
