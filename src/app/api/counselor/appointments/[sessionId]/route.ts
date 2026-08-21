// src/app/api/counselor/appointments/[sessionId]/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAppointment } from '@/lib/permissions'

export async function PATCH(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (body.status && ['scheduled', 'completed', 'cancelled', 'no_show'].includes(body.status)) {
    update.status = body.status
  }
  if (typeof body.sessionSummary === 'string') {
    update.session_summary = body.sessionSummary.trim() || null
  }

  const { error } = await supabase
    .from('counseling_sessions')
    .update(update)
    .eq('id', sessionId)
    .eq('counselor_profile_id', caller.userId)

  if (error) {
    return NextResponse.json({ error: 'Could not update the appointment. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
