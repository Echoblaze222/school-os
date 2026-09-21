// src/app/api/students/link-code/route.ts
//
// Issues (or rotates) the PARENT LINK CODE for one student. Principal,
// secretary and admin only, and only for students at the caller's own school.
// The plaintext code is returned exactly once; the database keeps a hash, so
// it cannot be shown again. Issuing a new code revokes the previous one.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { issueStudentLinkCode } from '@/lib/credentials'

function reply(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return reply({ ok: false, error: 'Not authenticated' }, 401)

    const admin = createAdminClient()
    const { data: caller } = await admin
      .from('profiles').select('role, school_id').eq('id', user.id).single()
    if (!caller || !['principal', 'secretary', 'admin'].includes((caller as any).role) || !(caller as any).school_id) {
      return reply({ ok: false, error: 'Forbidden' }, 403)
    }

    const body = await req.json().catch(() => null)
    const studentId = typeof body?.studentId === 'string' ? body.studentId : ''
    if (!studentId) return reply({ ok: false, error: 'studentId is required' }, 400)

    const { data: target } = await admin
      .from('profiles').select('id, role, school_id').eq('id', studentId).maybeSingle()
    // Same answer whether the id is missing, not a student, or in another school.
    if (!target || (target as any).role !== 'student' || (target as any).school_id !== (caller as any).school_id) {
      return reply({ ok: false, error: 'Student not found' }, 404)
    }

    const issued = await issueStudentLinkCode(admin, { studentId, createdBy: user.id })

    try {
      // NEVER log the code itself.
      await admin.from('portal_audit_log').insert({
        action:       'student_link_code_issued',
        actor_id:     user.id,
        target_table: 'profiles',
        target_id:    studentId,
        metadata:     { school_id: (caller as any).school_id },
        logged_at:    new Date().toISOString(),
      })
    } catch { /* non-critical */ }

    return reply({ ok: true, code: issued.code, expiresAt: issued.expiresAt }, 200)
  } catch (e: unknown) {
    console.error('link-code issue error:', e instanceof Error ? e.message : 'unknown error')
    return reply({ ok: false, error: 'Could not issue a link code. Please try again.' }, 500)
  }
}
