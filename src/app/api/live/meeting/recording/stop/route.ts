// src/app/api/live/meeting/recording/stop/route.ts
// Meeting equivalent of /api/live/recording/stop/route.ts. Uses
// stopClassRecording from livekit.ts directly — it only takes an egress
// ID and has nothing class-specific about it, so there's no separate
// "stopMeetingRecording" to write.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { auditLog } from '@/lib/auditLog'
import { logger, newTraceId } from '@/lib/logger'
import { decideMeetingAccess, isMeetingDenied, loadMeetingCallerProfile, loadOnlineMeeting } from '@/lib/liveClass/meetingAuthorize'
import { stopClassRecording } from '@/lib/liveClass/livekit'

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
  const decision = decideMeetingAccess({ caller, meeting, isInSpecificClassAudience: false, schoolLock: { locked: false } })

  if (isMeetingDenied(decision) || decision.role !== 'host') {
    logger.warn('meeting recording stop denied', { traceId, userId: user.id, meetingId: body.meetingId })
    return NextResponse.json({ error: 'Only the meeting host can stop recording.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: current } = await admin
    .from('online_meetings')
    .select('active_egress_id')
    .eq('id', decision.meetingId)
    .maybeSingle()

  if (!current?.active_egress_id) {
    return NextResponse.json({ error: 'This meeting is not currently being recorded.' }, { status: 409 })
  }

  try {
    await stopClassRecording(current.active_egress_id)
  } catch (err) {
    logger.error('meeting recording stop: Egress failed', { traceId, meetingId: decision.meetingId, error: (err as Error).message })
  }

  await admin.from('online_meetings').update({ active_egress_id: null }).eq('id', decision.meetingId)

  await auditLog(supabase, {
    actorId: user.id,
    action: 'meeting.recording_stopped',
    targetTable: 'online_meetings',
    targetId: decision.meetingId,
    metadata: { traceId },
  })

  return NextResponse.json({ ok: true })
}
