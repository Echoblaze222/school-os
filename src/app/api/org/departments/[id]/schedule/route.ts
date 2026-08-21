// src/app/api/org/departments/[id]/schedule/route.ts

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { resolveUserContext } from '@/lib/permissions'
import { listSchedule, createScheduleItem } from '@/lib/supabase/departmentWork'
import { PermissionError } from '@/lib/supabase/appointments'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated' }, { status: 401 })

  const schedule = await listSchedule(supabase, id)
  return NextResponse.json({ ok: true, schedule })
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
    const item = await createScheduleItem(ctx, id, {
      title,
      day_of_week: typeof body?.day_of_week === 'number' ? body.day_of_week : null,
      specific_date: typeof body?.specific_date === 'string' ? body.specific_date : null,
      start_time: typeof body?.start_time === 'string' ? body.start_time : null,
      end_time: typeof body?.end_time === 'string' ? body.end_time : null,
      location: typeof body?.location === 'string' ? body.location : undefined,
    })
    return NextResponse.json({ ok: true, item })
  } catch (err) {
    if (err instanceof PermissionError) return NextResponse.json({ ok: false, error: err.message }, { status: 403 })
    console.error('[api/org/departments/id/schedule] error:', err)
    return NextResponse.json({ ok: false, error: 'Could not create schedule item.' }, { status: 500 })
  }
}
