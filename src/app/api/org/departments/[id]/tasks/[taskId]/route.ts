// src/app/api/org/departments/[id]/tasks/[taskId]/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { updateTask, deleteTask } from '@/lib/supabase/departmentWork'
import { PermissionError } from '@/lib/supabase/appointments'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const input: Record<string, unknown> = {}
  if (typeof body?.title === 'string') input.title = body.title.trim()
  if (body && 'description' in body) input.description = typeof body.description === 'string' ? body.description : null
  if (body && 'assigned_to' in body) input.assigned_to = typeof body.assigned_to === 'string' ? body.assigned_to : null
  if (['todo', 'in_progress', 'done'].includes(body?.status)) input.status = body.status
  if (body && 'due_date' in body) input.due_date = typeof body.due_date === 'string' ? body.due_date : null

  try {
    await updateTask(ctx, id, taskId, input)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/.../tasks/id] update error:', err)
    return NextResponse.json({ ok: false, error: 'Could not update task.' }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; taskId: string }> }) {
  const { id, taskId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  try {
    await deleteTask(ctx, id, taskId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/.../tasks/id] delete error:', err)
    return NextResponse.json({ ok: false, error: 'Could not delete task.' }, { status: 500 })
  }
}
