// src/app/api/org/departments/[id]/objectives/route.ts
// GET: list objectives for a department (same-school read, RLS floor).
// POST: create one. Grant: canManageDepartmentWork - Principal, the Vice
// Principal whose scope includes this department, or its own HOD.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { listObjectives, createObjective } from '@/lib/supabase/departmentWork'
import { PermissionError } from '@/lib/supabase/appointments'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const objectives = await listObjectives(supabase, id)
  return NextResponse.json({ ok: true, objectives })
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
    const objective = await createObjective(ctx, id, {
      title,
      description: typeof body?.description === 'string' ? body.description : undefined,
      target_date: typeof body?.target_date === 'string' ? body.target_date : null,
    })
    return NextResponse.json({ ok: true, objective })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/org/departments/id/objectives] error:', err)
    return NextResponse.json({ ok: false, error: 'Could not create objective.' }, { status: 500 })
  }
}
