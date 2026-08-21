// src/app/api/org/departments/[id]/tasks/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { listTasks, createTask } from '@/lib/supabase/departmentWork'
import { PermissionError } from '@/lib/supabase/appointments'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const tasks = await listTasks(supabase, id)
  return NextResponse.json({ ok: true, tasks })
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
  if (!title) return NextResponse.json({ ok: false, error: 'Title is required.' }, { status: 400 })

  try {
    const task = await createTask(ctx, id, {
      title,
      description: typeof body?.description === 'string' ? body.description : undefined,
      assigned_to: typeof body?.assigned_to === 'string' ? body.assigned_to : null,
      due_date: typeof body?.due_date === 'string' ? body.due_date : null,
    })
    return NextResponse.json({ ok: true, task })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/org/departments/id/tasks] error:', err)
    return NextResponse.json({ ok: false, error: 'Could not create task.' }, { status: 500 })
  }
}
