// src/app/api/live/meeting/recording/start/route.ts
// Meeting equivalent of /api/live/recording/start/route.ts.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSubscription } from '@/lib/subscription'
import { checkRateLimit } from '@/lib/rateLimit'
import { auditLog } from '@/lib/auditLog'
import { logger, newTraceId } from '@/lib/logger'
import { decideMeetingAccess, isMeetingDenied, loadMeetingCallerProfile, loadOnlineMeeting } from '@/lib/liveClass/meetingAuthorize'
import { startMeetingRecording } from '@/lib/liveClass/livekit'

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

  const admin = createAdminClient()
  const rl = await checkRateLimit(admin, 'meeting_recording', user.id, 10, 60)
  if (!rl.allowed) return NextResponse.json({ error: rl.errorResponse?.error ?? 'Too many requests.' }, { status: rl.errorResponse?.status ?? 429 })

  const caller = await loadMeetingCallerProfile(supabase, user.id)
  if (!caller) return NextResponse.json({ error: "We couldn't find your profile." }, { status: 403 })

  const [meeting, schoolLock] = await Promise.all([
    loadOnlineMeeting(supabase, body.meetingId),
    checkSubscription(user.id),
  ])
  const decision = decideMeetingAccess({ caller, meeting, isInSpecificClassAudience: false, schoolLock: { locked: schoolLock.locked } })

  if (isMeetingDenied(decision)) {
    logger.warn('meeting recording start denied', { traceId, userId: user.id, meetingId: body.meetingId, reason: decision.reason })
    return NextResponse.json({ error: 'Only the meeting host can start recording.' }, { status: 403 })
  }
  if (decision.role !== 'host') {
    return NextResponse.json({ error: 'Only the meeting host can start recording.' }, { status: 403 })
  }

  const { data: current } = await supabase
    .from('online_meetings')
    .select('active_egress_id')
    .eq('id', decision.meetingId)
    .maybeSingle()
  if (current?.active_egress_id) {
    return NextResponse.json({ error: 'This meeting is already being recorded.' }, { status: 409 })
  }

  let egressId: string
  try {
    const result = await startMeetingRecording({ schoolId: decision.schoolId, meetingId: decision.meetingId })
    egressId = result.egressId
  } catch (err) {
    logger.error('meeting recording start: Egress failed', { traceId, meetingId: decision.meetingId, error: (err as Error).message })
    return NextResponse.json({ error: "Couldn't start recording. Please try again." }, { status: 502 })
  }

  await admin.from('online_meetings').update({ active_egress_id: egressId }).eq('id', decision.meetingId)

  await auditLog(supabase, {
    actorId: user.id,
    action: 'meeting.recording_started',
    targetTable: 'online_meetings',
    targetId: decision.meetingId,
    metadata: { traceId, egressId },
  })

  return NextResponse.json({ ok: true })
}
