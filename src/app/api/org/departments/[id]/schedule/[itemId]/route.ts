// src/app/api/org/departments/[id]/schedule/[itemId]/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { deleteScheduleItem } from '@/lib/supabase/departmentWork'
import { PermissionError } from '@/lib/supabase/appointments'

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const ctx = await resolveUserContext(supabase, user.id)
  if (!ctx) return NextResponse.json({ ok: false, error: 'Profile not found' }, { status: 404 })

  try {
    await deleteScheduleItem(ctx, id, itemId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/.../schedule/id] delete error:', err)
    return NextResponse.json({ ok: false, error: 'Could not delete schedule item.' }, { status: 500 })
  }
}
