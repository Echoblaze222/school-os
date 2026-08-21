// src/app/api/counselor/follow-ups/[followUpId]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAppointment } from '@/lib/permissions'

export async function PATCH(request: Request, { params }: { params: Promise<{ followUpId: string }> }) {
  const { followUpId } = await params
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { status } = await request.json()
  if (!['pending', 'done', 'cancelled'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status.' }, { status: 400 })
  }

  const update: Record<string, unknown> = { status }
  update.completed_at = status === 'done' ? new Date().toISOString() : null

  const { error } = await supabase
    .from('counseling_follow_ups')
    .update(update)
    .eq('id', followUpId)
    .eq('counselor_profile_id', caller.userId)

  if (error) {
    return NextResponse.json({ error: 'Could not update the follow-up. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
