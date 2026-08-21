// src/app/api/org/departments/[id]/reports/[reportId]/route.ts
// PATCH: acknowledge a report - the only mutation a report gets. Grant:
// canManageDepartmentWork, but not the HOD path - see acknowledgeReport().

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { acknowledgeReport } from '@/lib/supabase/departmentWork'
import { PermissionError } from '@/lib/supabase/appointments'

export async function PATCH(_req: Request, { params }: { params: Promise<{ id: string; reportId: string }> }) {
  const { id, reportId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  try {
    await acknowledgeReport(ctx, id, reportId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/.../reports/id] acknowledge error:', err)
    return NextResponse.json({ ok: false, error: 'Could not acknowledge report.' }, { status: 500 })
  }
}
