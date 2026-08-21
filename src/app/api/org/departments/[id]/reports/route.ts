// src/app/api/org/departments/[id]/reports/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { listReports, submitReport } from '@/lib/supabase/departmentWork'
import { PermissionError } from '@/lib/supabase/appointments'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const reports = await listReports(supabase, id)
  return NextResponse.json({ ok: true, reports })
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const reportBody = typeof body?.body === 'string' ? body.body.trim() : ''
  if (!title || !reportBody) return NextResponse.json({ ok: false, error: 'Title and body are required.' }, { status: 400 })

  try {
    const report = await submitReport(ctx, id, { title, body: reportBody, period: typeof body?.period === 'string' ? body.period : undefined })
    return NextResponse.json({ ok: true, report })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/org/departments/id/reports] error:', err)
    return NextResponse.json({ ok: false, error: 'Could not submit report.' }, { status: 500 })
  }
}
