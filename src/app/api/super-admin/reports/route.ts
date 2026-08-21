// src/app/api/super-admin/reports/route.ts
// Phase 4, Lane G (§52, §62) - review queue for public.content_reports.
// Same assertSuperAdmin() pattern as manage-school/route.ts - deliberately
// not extracted into a shared helper yet, matching that file's existing
// convention rather than introducing a new one for just two call sites.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

async function assertSuperAdmin() {
  const supabase = await createClient()
  const adminSupabase = createAdminClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: sa } = await adminSupabase
    .from('platform_admins')
    .select('id')
    .eq('id', user.id)
    .single()
  if (!sa) throw new Error('Not a super admin')
  return { adminId: user.id, adminSupabase }
}

// GET - list reports, optionally filtered by status (defaults to open + reviewing)
export async function GET(req: Request) {
  try {
    const { adminSupabase } = await assertSuperAdmin()
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    let query = adminSupabase
      .from('content_reports')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)

    query = status ? query.eq('status', status) : query.in('status', ['open', 'reviewing'])

    const { data, error } = await query
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, reports: data ?? [] })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}

// PATCH - move a report through the review workflow
export async function PATCH(req: Request) {
  try {
    const { adminId, adminSupabase } = await assertSuperAdmin()
    const body = await req.json().catch(() => null)
    const { report_id, status, resolution_note } = body ?? {}

    const VALID = ['open', 'reviewing', 'actioned', 'dismissed']
    if (!report_id || !VALID.includes(status)) {
      return NextResponse.json({ ok: false, error: 'report_id and a valid status are required.' }, { status: 400 })
    }

    const isResolved = status === 'actioned' || status === 'dismissed'

    const { error } = await adminSupabase
      .from('content_reports')
      .update({
        status,
        resolution_note: resolution_note ? String(resolution_note).slice(0, 2000) : null,
        resolved_by: isResolved ? adminId : null,
        resolved_at: isResolved ? new Date().toISOString() : null,
      })
      .eq('id', report_id)

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

    await adminSupabase.from('portal_audit_log').insert({
      actor_id: adminId, action: 'resolve_content_report',
      target_table: 'content_reports', target_id: report_id,
      metadata: { status, resolution_note },
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Server error'
    return NextResponse.json({ ok: false, error: msg }, { status: 401 })
  }
}
