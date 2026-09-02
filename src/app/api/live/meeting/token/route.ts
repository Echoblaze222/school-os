// src/app/api/live/meeting/token/route.ts
//
// Mints a LiveKit token for an existing `online_meetings` row (PTA, staff
// meeting — Phase 4, embedded into SchoolOS's pre-existing meetings
// feature rather than a new table). Structurally identical to
// /api/live/token/route.ts (class sessions) — see that file's header
// comment. Kept as a separate route from the class token endpoint for
// the same reason meetingAuthorize.ts is a separate module from
// authorize.ts: the two domains' authorization shapes are different
// enough that combining them risks each breaking the other.

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
import { mintMeetingToken, meetingRoomNameFor } from '@/lib/liveClass/livekit'

const REASON_STATUS: Record<string, number> = {
  not_authenticated: 401,
  no_profile: 403,
  school_locked: 403,
  meeting_not_found: 404,
  cross_school: 403,
  not_authorized_audience: 403,
}

const REASON_MESSAGE: Record<string, string> = {
  not_authenticated: 'You need to be signed in to join a meeting.',
  no_profile: "We couldn't find your profile. Please sign in again.",
  school_locked: 'Your school does not currently have access to meetings. Contact your school administrator.',
  meeting_not_found: 'This meeting could not be found.',
  cross_school: 'This meeting belongs to a different school.',
  not_authorized_audience: "This meeting isn't open to your account type.",
}

export async function POST(req: Request) {
  const traceId = newTraceId()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: REASON_MESSAGE.not_authenticated }, { status: 401 })

  let body: { meetingId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const meetingId = body.meetingId
  if (!meetingId || typeof meetingId !== 'string') {
    return NextResponse.json({ error: 'meetingId is required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const rl = await checkRateLimit(admin, 'meeting_token', user.id, 30, 60)
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.errorResponse?.error ?? 'Too many requests. Please try again shortly.' }, { status: rl.errorResponse?.status ?? 429 })
  }

  const caller = await loadMeetingCallerProfile(supabase, user.id)
  if (!caller) {
    logger.warn('meeting token denied: no profile', { traceId, userId: user.id })
    return NextResponse.json({ error: REASON_MESSAGE.no_profile }, { status: 403 })
  }

  const [meeting, schoolLock] = await Promise.all([
    loadOnlineMeeting(supabase, meetingId),
    checkSubscription(user.id),
  ])
  const isInSpecificClassAudience = await loadIsInSpecificClassAudience(supabase, caller, meeting)

  const decision = decideMeetingAccess({ caller, meeting, isInSpecificClassAudience, schoolLock: { locked: schoolLock.locked } })

  if (isMeetingDenied(decision)) {
    logger.warn('meeting token denied', { traceId, userId: user.id, schoolId: caller.schoolId ?? undefined, meetingId, reason: decision.reason })
    if (decision.reason === 'school_locked' && meeting) {
      admin.from('online_meetings').update({ locked_at: new Date().toISOString() }).eq('id', meeting.id).then(() => {})
    }
    return NextResponse.json({ error: REASON_MESSAGE[decision.reason] }, { status: REASON_STATUS[decision.reason] ?? 403 })
  }

  // First host to mint a token claims the room name and switches this
  // meeting onto the embedded-video path — same pattern as the class
  // token route, independently re-checked by online_meetings' own RLS
  // update policy (Phase 4 migration: is_staff() only) and the
  // tamper-prevention trigger.
  if (decision.role === 'host' && meeting) {
    const room = meetingRoomNameFor(decision.schoolId, decision.meetingId)
    await supabase
      .from('online_meetings')
      .update({ provider: 'livekit', livekit_room_name: room })
      .eq('id', meeting.id)
      .is('livekit_room_name', null)
  }

  const token = await mintMeetingToken({
    identity: user.id,
    displayName: caller.fullName ?? user.email ?? 'Participant',
    schoolId: decision.schoolId,
    meetingId: decision.meetingId,
    role: decision.role,
    allowVideo: decision.role === 'host',
  })

  const { data: current } = await supabase
    .from('online_meetings')
    .select('active_egress_id')
    .eq('id', decision.meetingId)
    .maybeSingle()

  await auditLog(supabase, {
    actorId: user.id,
    action: 'meeting.token_issued',
    targetTable: 'online_meetings',
    targetId: decision.meetingId,
    metadata: { role: decision.role, traceId },
  })

  return NextResponse.json({
    token,
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    role: decision.role,
    roomName: meetingRoomNameFor(decision.schoolId, decision.meetingId),
    recording: (current?.active_egress_id ?? null) !== null,
  })
}
