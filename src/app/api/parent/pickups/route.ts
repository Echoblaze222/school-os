// src/app/api/parent/pickups/route.ts
//
// A parent manages who may collect their child.
//
//   GET   ?student_id=            -> authorised people for that child (never the codes)
//   POST  { student_id, person_name, relationship, phone?, valid_until? }
//                                 -> adds a person and returns their one-time code ONCE
//   PATCH { id, action: 'revoke' | 'regenerate' }
//                                 -> revoke a person, or issue them a new code (returned once)
//
// Security: caller must be a parent linked to the child (parent_student_links,
// or the legacy profiles.parent_id) and in the same school. The school always
// comes from the caller's profile. Codes are stored only as an HMAC.

import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generatePickupCode, getPickupSecret, hashPickupCode } from '@/lib/pickupCode'
import { isIsoDate } from '@/lib/dataProtection'

type Admin = ReturnType<typeof createAdminClient>
const MAX_ACTIVE_PER_CHILD = 10
const MIGRATION_HINT =
  'Pickup authorisation is not set up yet. Ask the school to run sql/migrations/2026-10-27-pickup-authorisation.sql.'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

function fail(err: { message?: string } | null | undefined) {
  const m = (err?.message ?? '').toLowerCase()
  if (m.includes('does not exist') || m.includes('could not find') || m.includes('schema cache')) {
    return NextResponse.json({ error: MIGRATION_HINT, code: 'migration_required' }, { status: 503 })
  }
  console.error('parent pickups error:', err?.message)
  return bad('Something went wrong. Please try again.', 500)
}

async function getParent() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: bad('Unauthorized', 401) }
  const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  const role = (profile as any)?.role
  const schoolId = (profile as any)?.school_id as string | undefined
  if (role !== 'parent' || !schoolId) return { error: bad('Forbidden', 403) }
  return { userId: user.id, schoolId }
}

async function isLinked(admin: Admin, parentId: string, studentId: string, schoolId: string) {
  const { data: student } = await admin.from('profiles').select('id, school_id').eq('id', studentId).eq('role', 'student').maybeSingle()
  if (!student || (student as any).school_id !== schoolId) return false
  const { data: link } = await admin.from('parent_student_links').select('student_id').eq('parent_id', parentId).eq('student_id', studentId).limit(1)
  if (link && link.length > 0) return true
  const { data: legacy } = await admin.from('profiles').select('id').eq('id', studentId).eq('parent_id', parentId).limit(1)
  return !!legacy && legacy.length > 0
}

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

async function audit(admin: Admin, actorId: string, action: string, schoolId: string, targetId: string | null) {
  try {
    await admin.from('portal_audit_log').insert({
      action, actor_id: actorId, target_table: 'authorized_pickups', target_id: targetId,
      metadata: { school_id: schoolId }, logged_at: new Date().toISOString(),
    })
  } catch { /* non-critical */ }
}

export async function GET(req: Request) {
  const caller = await getParent()
  if ('error' in caller) return caller.error
  const studentId = new URL(req.url).searchParams.get('student_id') ?? ''
  const admin = createAdminClient()
  if (!(await isLinked(admin, caller.userId, studentId, caller.schoolId))) return bad('Child not found', 404)

  const { data, error } = await admin
    .from('authorized_pickups')
    .select('id, person_name, relationship, phone, valid_until, active, created_at')
    .eq('student_id', studentId).eq('school_id', caller.schoolId)
    .order('created_at', { ascending: false })
  if (error) return fail(error)
  return NextResponse.json({ people: data ?? [] })
}

export async function POST(req: Request) {
  const caller = await getParent()
  if ('error' in caller) return caller.error
  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }

  const admin = createAdminClient()
  const studentId = typeof body?.student_id === 'string' ? body.student_id : ''
  if (!(await isLinked(admin, caller.userId, studentId, caller.schoolId))) return bad('Child not found', 404)

  const name = str(body?.person_name, 120)
  const relationship = str(body?.relationship, 60)
  if (!name || !relationship) return bad('Name and relationship are required')

  let validUntil: string | null = null
  if (body?.valid_until) {
    if (!isIsoDate(body.valid_until)) return bad('Date is not valid')
    validUntil = body.valid_until
  }

  const { count, error: cErr } = await admin
    .from('authorized_pickups').select('id', { count: 'exact', head: true })
    .eq('student_id', studentId).eq('active', true)
  if (cErr) return fail(cErr)
  if ((count ?? 0) >= MAX_ACTIVE_PER_CHILD) return bad(`You can authorise at most ${MAX_ACTIVE_PER_CHILD} people. Remove someone first.`)

  let secret: string
  try { secret = getPickupSecret() } catch { return bad('Pickup codes are not configured on this server', 500) }

  const id = crypto.randomUUID()
  const code = generatePickupCode()
  const { error } = await admin.from('authorized_pickups').insert({
    id,
    school_id: caller.schoolId,
    student_id: studentId,
    created_by: caller.userId,
    person_name: name,
    relationship,
    phone: str(body?.phone, 40),
    code_hash: hashPickupCode(code, id, secret),
    valid_until: validUntil,
  })
  if (error) return fail(error)
  await audit(admin, caller.userId, 'pickup_person_added', caller.schoolId, id)
  // The only time the plain code ever leaves the server.
  return NextResponse.json({ id, code })
}

export async function PATCH(req: Request) {
  const caller = await getParent()
  if ('error' in caller) return caller.error
  let body: any
  try { body = await req.json() } catch { return bad('Invalid JSON') }
  if (typeof body?.id !== 'string') return bad('id is required')
  if (body.action !== 'revoke' && body.action !== 'regenerate') return bad('Unknown action')

  const admin = createAdminClient()
  const { data: row, error } = await admin
    .from('authorized_pickups').select('id, student_id, school_id, active')
    .eq('id', body.id).maybeSingle()
  if (error) return fail(error)
  if (!row || (row as any).school_id !== caller.schoolId ||
      !(await isLinked(admin, caller.userId, (row as any).student_id, caller.schoolId))) {
    return bad('Not found', 404)
  }

  if (body.action === 'revoke') {
    const { error: uErr } = await admin.from('authorized_pickups').update({ active: false }).eq('id', body.id)
    if (uErr) return fail(uErr)
    await audit(admin, caller.userId, 'pickup_person_revoked', caller.schoolId, body.id)
    return NextResponse.json({ ok: true })
  }

  if (!(row as any).active) return bad('This person has been removed. Add them again to issue a new code.')
  let secret: string
  try { secret = getPickupSecret() } catch { return bad('Pickup codes are not configured on this server', 500) }
  const code = generatePickupCode()
  const { error: uErr } = await admin.from('authorized_pickups')
    .update({ code_hash: hashPickupCode(code, body.id, secret) }).eq('id', body.id)
  if (uErr) return fail(uErr)
  await audit(admin, caller.userId, 'pickup_code_regenerated', caller.schoolId, body.id)
  return NextResponse.json({ ok: true, code })
}
