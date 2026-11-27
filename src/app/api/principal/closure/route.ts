// src/app/api/principal/closure/route.ts
//
// School closure / remote-learning mode (principal only).
//
//   GET                       -> { current, history }
//   POST  { mode, reason, message?, starts_on?, expected_end_on?, notify? }
//                             -> ends any active closure, starts this one, notifies everyone
//   PATCH { id, notify? }     -> ends the closure (and tells everyone school is back)
//
// Security: caller must be the principal; the school always comes from the
// caller's own profile. Needs sql/migrations/2026-10-27-school-closures.sql.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { CLOSURE_MODES, CLOSURE_REASON_IDS, isClosureLive, notificationText } from '@/lib/closure'

type Admin = ReturnType<typeof createAdminClient>
const MIGRATION_HINT =
  'Closure mode is not set up yet. Run sql/migrations/2026-10-27-school-closures.sql in the Supabase SQL editor, then reload.'
const CHUNK = 500

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })
const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))

function fail(err: { message?: string } | null | undefined) {
  const m = (err?.message ?? '').toLowerCase()
  if (m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache')) {
    return NextResponse.json({ error: MIGRATION_HINT, code: 'migration_required' }, { status: 503 })
  }
  console.error('closure route error:', err?.message)
  return bad('Something went wrong. Please try again.', 500)
}

async function getPrincipal() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: bad('Unauthorized', 401) }
  const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  const schoolId = (profile as any)?.school_id as string | undefined
  if ((profile as any)?.role !== 'principal' || !schoolId) return { error: bad('Forbidden', 403) }
  return { userId: user.id, schoolId }
}

const ACTION_URL: Record<string, string> = {
  student: '/dashboard/student',
  parent: '/dashboard/parent/assignments',
  teacher: '/dashboard/teacher/assignments',
}

/** Best-effort: never fails the closure itself. Returns how many were notified. */
async function notifyEveryone(admin: Admin, schoolId: string, title: string, body: string): Promise<number> {
  try {
    const { data: people, error } = await admin
      .from('profiles').select('id, role')
      .eq('school_id', schoolId).in('role', ['student', 'parent', 'teacher'])
    if (error || !people) return 0

    const rows = people.map((p: any) => ({
      user_id: p.id, school_id: schoolId, type: 'general', title, body,
      action_url: ACTION_URL[p.role] ?? '/dashboard', is_read: false,
    }))
    let sent = 0
    for (let i = 0; i < rows.length; i += CHUNK) {
      const { error: insErr } = await admin.from('notifications').insert(rows.slice(i, i + CHUNK))
      if (insErr) { console.error('closure notify failed:', insErr.message); break }
      sent += Math.min(CHUNK, rows.length - i)
    }
    return sent
  } catch (e: any) {
    console.error('closure notify error:', e?.message)
    return 0
  }
}

async function audit(admin: Admin, actorId: string, action: string, schoolId: string, metadata: Record<string, unknown>) {
  try {
    await admin.from('portal_audit_log').insert({
      action, actor_id: actorId, target_table: 'school_closures', target_id: null,
      metadata: { school_id: schoolId, ...metadata }, logged_at: new Date().toISOString(),
    })
  } catch { /* non-critical */ }
}

export async function GET() {
  const caller = await getPrincipal()
  if ('error' in caller) return caller.error
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('school_closures').select('*')
    .eq('school_id', caller.schoolId).order('created_at', { ascending: false }).limit(11)
  if (error) return fail(error)
  const rows = (data ?? []) as any[]
  const active = rows.find(r => r.active) ?? null
  return NextResponse.json({
    current: active ? { ...active, live: isClosureLive(active) } : null,
    history: rows.filter(r => !r.active).slice(0, 10),
  })
}

export async function POST(req: Request) {
  const caller = await getPrincipal()
  if ('error' in caller) return caller.error
  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }

  if (!(CLOSURE_MODES as readonly string[]).includes(body?.mode)) return bad('Choose closed or learning from home')
  if (!CLOSURE_REASON_IDS.includes(body?.reason)) return bad('Choose a reason')
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 1000) || null : null
  if (body.mode === 'remote' && !message) return bad('Tell families how learning will work while school is closed')

  const startsOn = body?.starts_on ? body.starts_on : new Date().toISOString().slice(0, 10)
  const endOn = body?.expected_end_on ? body.expected_end_on : null
  if (!isIsoDate(startsOn) || (endOn !== null && !isIsoDate(endOn))) return bad('Dates are not valid')
  if (endOn && endOn < startsOn) return bad('The reopening date is before the start date')

  const admin = createAdminClient()

  // One active closure at a time: end any current one first.
  const { error: endErr } = await admin.from('school_closures')
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq('school_id', caller.schoolId).eq('active', true)
  if (endErr) return fail(endErr)

  const { data: created, error } = await admin.from('school_closures').insert({
    school_id: caller.schoolId, mode: body.mode, reason: body.reason, message,
    starts_on: startsOn, expected_end_on: endOn, created_by: caller.userId,
  }).select('*').single()
  if (error) return fail(error)

  let notified = 0
  if (body.notify !== false) {
    const t = notificationText({ mode: body.mode, reason: body.reason, message, expected_end_on: endOn })
    notified = await notifyEveryone(admin, caller.schoolId, t.title, t.body)
  }
  await audit(admin, caller.userId, 'closure_started', caller.schoolId, { mode: body.mode, reason: body.reason, notified })
  return NextResponse.json({ ok: true, closure: created, notified })
}

export async function PATCH(req: Request) {
  const caller = await getPrincipal()
  if ('error' in caller) return caller.error
  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }
  if (typeof body?.id !== 'string') return bad('id is required')

  const admin = createAdminClient()
  const { data, error } = await admin.from('school_closures')
    .update({ active: false, ended_at: new Date().toISOString() })
    .eq('id', body.id).eq('school_id', caller.schoolId).eq('active', true).select('id')
  if (error) return fail(error)
  if (!data || data.length === 0) return bad('No active closure found', 404)

  let notified = 0
  if (body.notify !== false) {
    notified = await notifyEveryone(admin, caller.schoolId, 'School is open again', 'Classes have resumed as normal.')
  }
  await audit(admin, caller.userId, 'closure_ended', caller.schoolId, { notified })
  return NextResponse.json({ ok: true, notified })
}
