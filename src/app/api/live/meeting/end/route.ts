// src/app/api/live/meeting/end/route.ts
// Meeting equivalent of /api/live/end/route.ts.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditLog } from '@/lib/auditLog'
import { logger, newTraceId } from '@/lib/logger'
import { decideMeetingAccess, isMeetingDenied, loadMeetingCallerProfile, loadOnlineMeeting } from '@/lib/liveClass/meetingAuthorize'
import { endMeetingRoom } from '@/lib/liveClass/livekit'

export async function POST(req: Request) {
  const traceId = newTraceId()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  let body: { meetingId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  if (!body.meetingId) return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 })

  const caller = await loadMeetingCallerProfile(supabase, user.id)
  if (!caller) return NextResponse.json({ error: "We couldn't find your profile." }, { status: 403 })

  const meeting = await loadOnlineMeeting(supabase, body.meetingId)
  const decision = decideMeetingAccess({
    caller,
    meeting,
    isInSpecificClassAudience: false, // irrelevant to the host-only check below
    // Not gated on schoolLock — a school locked mid-meeting shouldn't
    // trap an in-progress one open (same reasoning as /api/live/end).
    schoolLock: { locked: false },
  })

  if (isMeetingDenied(decision) || decision.role !== 'host') {
    logger.warn('meeting end denied', { traceId, userId: user.id, meetingId: body.meetingId })
    return NextResponse.json({ error: 'Only the meeting host can end this meeting.' }, { status: 403 })
  }

  try {
    await endMeetingRoom(decision.schoolId, decision.meetingId)
  } catch (err) {
    logger.error('meeting end: LiveKit deleteRoom failed', { traceId, error: (err as Error).message })
  }

  const admin = createAdminClient()
  await admin
    .from('online_meetings')
    .update({ is_live: false, ended_at: new Date().toISOString() })
    .eq('id', decision.meetingId)
    .eq('is_live', true)

  await auditLog(supabase, {
    actorId: user.id,
    action: 'meeting.ended_by_host',
    targetTable: 'online_meetings',
    targetId: decision.meetingId,
    metadata: { traceId },
  })

  return NextResponse.json({ ok: true })
}
