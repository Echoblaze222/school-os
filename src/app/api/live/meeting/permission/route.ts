// src/app/api/live/meeting/permission/route.ts
// Meeting equivalent of /api/live/permission/route.ts. See that file's
// header comment for the full reasoning (unchanged here).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSubscription } from '@/lib/subscription'
import { checkRateLimit } from '@/lib/rateLimit'
import { auditLog } from '@/lib/auditLog'
import { logger, newTraceId } from '@/lib/logger'
import {
  decideMeetingAccess,
  isMeetingDenied,
  loadMeetingCallerProfile,
  loadOnlineMeeting,
  loadIsInSpecificClassAudience,
} from '@/lib/liveClass/meetingAuthorize'
import { setMeetingParticipantPublishPermission } from '@/lib/liveClass/livekit'

export async function POST(req: Request) {
  const traceId = newTraceId()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  let body: { meetingId?: string; participantIdentity?: string; canPublishAudio?: boolean; canPublishVideo?: boolean }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const { meetingId, participantIdentity } = body
  if (!meetingId || !participantIdentity) {
    return NextResponse.json({ error: 'meetingId and participantIdentity are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const rl = await checkRateLimit(admin, 'meeting_permission', user.id, 60, 60)
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.errorResponse?.error ?? 'Too many requests.' }, { status: rl.errorResponse?.status ?? 429 })
  }

  const caller = await loadMeetingCallerProfile(supabase, user.id)
  if (!caller) return NextResponse.json({ error: "We couldn't find your profile." }, { status: 403 })

  const [meeting, schoolLock] = await Promise.all([
    loadOnlineMeeting(supabase, meetingId),
    checkSubscription(user.id),
  ])
  const isInSpecificClassAudience = await loadIsInSpecificClassAudience(supabase, caller, meeting)
  const decision = decideMeetingAccess({ caller, meeting, isInSpecificClassAudience, schoolLock: { locked: schoolLock.locked } })

  if (isMeetingDenied(decision)) {
    logger.warn('meeting permission change denied', { traceId, userId: user.id, meetingId, reason: decision.reason })
    return NextResponse.json({ error: 'Only the meeting host can change participant permissions.' }, { status: 403 })
  }
  if (decision.role !== 'host') {
    logger.warn('meeting permission change denied: not host', { traceId, userId: user.id, meetingId })
    return NextResponse.json({ error: 'Only the meeting host can change participant permissions.' }, { status: 403 })
  }

  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', participantIdentity)
    .eq('school_id', decision.schoolId)
    .maybeSingle()
  if (!targetProfile) return NextResponse.json({ error: 'That participant is not part of this school.' }, { status: 404 })

  try {
    await setMeetingParticipantPublishPermission({
      schoolId: decision.schoolId,
      meetingId: decision.meetingId,
      participantIdentity,
      canPublishAudio: !!body.canPublishAudio,
      canPublishVideo: !!body.canPublishVideo,
    })
  } catch (err) {
    logger.warn('meeting permission change failed', { traceId, meetingId, participantIdentity, error: (err as Error).message })
    return NextResponse.json({ error: "Couldn't update that participant — they may have already left." }, { status: 409 })
  }

  await auditLog(supabase, {
    actorId: user.id,
    action: 'meeting.permission_changed',
    targetTable: 'online_meetings',
    targetId: decision.meetingId,
    metadata: { traceId, participantIdentity, canPublishAudio: !!body.canPublishAudio, canPublishVideo: !!body.canPublishVideo },
  })

  return NextResponse.json({ ok: true })
}
