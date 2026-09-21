// app/api/parent/link-child/route.ts
//
// A parent links their account to a child using a PARENT LINK CODE that the
// school issued for that specific student (table student_link_codes, hashed,
// expiring). This is a different secret from the student's default_code,
// which is only a visible identifier and is never accepted here.
//
//   POST { child_code, preview: true }  -> { ok, student: { full_name, avatar_url, class_label } }
//   POST { child_code }                 -> { ok, child: { id, full_name } }
//
// The database function link_parent_by_code() re-checks everything (caller is
// a parent, code is live, student is a student in the SAME school as the
// parent) and performs the insert, so this route cannot be tricked into
// linking across schools. Every failure returns the same message.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { hashLinkCode, linkParentByCode, resolveStudentLinkCode } from '@/lib/credentials'

const INVALID_CODE_MESSAGE = "That code isn't valid or has expired. Ask your school for a new parent link code."

function reply(body: Record<string, unknown>, status: number, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } })
}

async function studentSummary(admin: ReturnType<typeof createAdminClient>, studentId: string) {
  const [{ data: p }, { data: sp }] = await Promise.all([
    admin.from('profiles').select('full_name, avatar_url').eq('id', studentId).maybeSingle(),
    admin.from('student_profiles').select('classes(name, class_level)').eq('id', studentId).maybeSingle(),
  ])
  const classes = (sp as any)?.classes
  const cls = Array.isArray(classes) ? classes[0] : classes
  return {
    full_name:   (p as any)?.full_name ?? 'Student',
    avatar_url:  (p as any)?.avatar_url ?? null,
    class_label: cls?.class_level ?? cls?.name ?? 'Student',
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return reply({ ok: false, error: 'Not authenticated' }, 401)

    const admin = createAdminClient()

    const { data: parent } = await admin
      .from('profiles').select('id, role, school_id').eq('id', user.id).single()
    if (!parent || (parent as any).role !== 'parent' || !(parent as any).school_id) {
      return reply({ ok: false, error: 'Only parent accounts can link a child.' }, 403)
    }
    const schoolId = (parent as any).school_id as string

    const body = await req.json().catch(() => null)
    const childCode = typeof body?.child_code === 'string' ? body.child_code : ''
    const preview = body?.preview === true
    if (!childCode.trim()) return reply({ ok: false, error: 'Enter the parent link code from your school.' }, 400)

    // Throttle per account and per IP before doing any lookup.
    const limits: Array<[string, string, number, number]> = [
      ['parent_link_user', user.id, 10, 300],
      ['parent_link_ip', getClientIp(req), 30, 60],
    ]
    for (const [scope, key, limit, windowSec] of limits) {
      const r = await checkRateLimit(admin, scope, key, limit, windowSec)
      if (!r.allowed) {
        const e = r.errorResponse!
        return reply({ ok: false, error: e.error }, e.status, e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : undefined)
      }
    }

    // A value that is not even shaped like a link code (for example the
    // student's default_code) can never match.
    const codeHash = hashLinkCode(childCode)
    if (!codeHash) return reply({ ok: false, error: INVALID_CODE_MESSAGE }, 404)
    const perCode = await checkRateLimit(admin, 'parent_link_code', codeHash, 8, 300)
    if (!perCode.allowed) {
      const e = perCode.errorResponse!
      return reply({ ok: false, error: e.error }, e.status, e.retryAfter ? { 'Retry-After': String(e.retryAfter) } : undefined)
    }

    if (preview) {
      const studentId = await resolveStudentLinkCode(admin, childCode, schoolId)
      if (!studentId) return reply({ ok: false, error: INVALID_CODE_MESSAGE }, 404)
      return reply({ ok: true, student: await studentSummary(admin, studentId) }, 200)
    }

    const studentId = await linkParentByCode(admin, user.id, childCode)
    if (!studentId) return reply({ ok: false, error: INVALID_CODE_MESSAGE }, 404)

    const summary = await studentSummary(admin, studentId)
    return reply({ ok: true, child: { id: studentId, full_name: summary.full_name } }, 200)
  } catch (e: unknown) {
    console.error('link-child error:', e instanceof Error ? e.message : 'unknown error')
    return reply({ ok: false, error: 'Something went wrong. Please try again.' }, 500)
  }
}
