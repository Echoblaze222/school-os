// src/app/api/org/departments/[id]/objectives/[objectiveId]/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { updateObjective, deleteObjective } from '@/lib/supabase/departmentWork'
import { PermissionError } from '@/lib/supabase/appointments'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; objectiveId: string }> }) {
  const { id, objectiveId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const input: Record<string, unknown> = {}
  if (typeof body?.title === 'string') input.title = body.title.trim()
  if (body && 'description' in body) input.description = typeof body.description === 'string' ? body.description : null
  if (['not_started', 'in_progress', 'completed'].includes(body?.status)) input.status = body.status
  if (body && 'target_date' in body) input.target_date = typeof body.target_date === 'string' ? body.target_date : null

  try {
    await updateObjective(ctx, id, objectiveId, input)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/.../objectives/id] update error:', err)
    return NextResponse.json({ ok: false, error: 'Could not update objective.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; objectiveId: string }> }) {
  const { id, objectiveId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  try {
    await deleteObjective(ctx, id, objectiveId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/.../objectives/id] delete error:', err)
    return NextResponse.json({ ok: false, error: 'Could not delete objective.' }, { status: 500 })
  }
}
