// src/app/api/live/token/route.ts
//
// Mints a LiveKit access token. This route IS the security boundary for
// the live classroom system — LiveKit itself has no idea what a "school"
// or "class" is, it only trusts whatever token it's handed. Every
// authorization decision happens here, server-side, before a token is
// ever created. See src/lib/liveClass/authorize.ts for the decision
// logic and its unit tests.
//
// Never exposes LIVEKIT_API_KEY/LIVEKIT_API_SECRET — those stay inside
// livekit.ts, which this route calls but never re-exports from.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSubscription } from '@/lib/subscription'
import { checkRateLimit } from '@/lib/rateLimit'
import { auditLog } from '@/lib/auditLog'
import { logger, newTraceId } from '@/lib/logger'
import {
  decideLiveClassAccess,
  loadCallerProfile,
  loadOnlineClass,
  isAssignedClassTeacher,
  isEnrolledInClass,
} from '@/lib/liveClass/authorize'
import { mintLiveClassToken, roomNameFor } from '@/lib/liveClass/livekit'

const REASON_STATUS: Record<string, number> = {
  not_authenticated: 401,
  no_profile: 403,
  school_locked: 403,
  session_not_found: 404,
  cross_school: 403,
  not_enrolled_in_class: 403,
  not_authorized_role: 403,
}

const REASON_MESSAGE: Record<string, string> = {
  not_authenticated: 'You need to be signed in to join a live class.',
  no_profile: "We couldn't find your profile. Please sign in again.",
  school_locked: 'Your school does not currently have access to live classes. Contact your school administrator.',
  session_not_found: 'This live class could not be found.',
  cross_school: 'This live class belongs to a different school.',
  not_enrolled_in_class: "This live class is for a different class than you're enrolled in.",
  not_authorized_role: "Your account isn't permitted to join live classes.",
}

export async function POST(req: Request) {
  const traceId = newTraceId()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: REASON_MESSAGE.not_authenticated }, { status: 401 })
  }

  let body: { onlineClassId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const onlineClassId = body.onlineClassId
  if (!onlineClassId || typeof onlineClassId !== 'string') {
    return NextResponse.json({ error: 'onlineClassId is required.' }, { status: 400 })
  }

  // Rate-limit token minting per user — same pattern/rationale as
  // first-login/code-signin: this endpoint is a natural target for a
  // scripted join-flood even by an otherwise-legitimate account.
  const admin = createAdminClient()
  const rl = await checkRateLimit(admin, 'live_class_token', user.id, 30, 60)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: rl.errorResponse?.error ?? 'Too many requests. Please try again shortly.' },
      { status: rl.errorResponse?.status ?? 429 }
    )
  }

  const caller = await loadCallerProfile(supabase, user.id)
  if (!caller) {
    logger.warn('live token denied: no profile', { traceId, userId: user.id })
    return NextResponse.json({ error: REASON_MESSAGE.no_profile }, { status: 403 })
  }

  const [session, schoolLock] = await Promise.all([
    loadOnlineClass(supabase, onlineClassId),
    checkSubscription(user.id),
  ])

  const isClassTeacher = session
    ? await isAssignedClassTeacher(supabase, user.id, session.class_id)
    : false
  const isEnrolledStudent = session && caller.role === 'student'
    ? await isEnrolledInClass(supabase, user.id, session.class_id)
    : false

  const decision = decideLiveClassAccess({
    caller,
    session,
    isClassTeacher,
    isEnrolledStudent,
    schoolLock: { locked: schoolLock.locked },
  })

  if (!decision.ok) {
    logger.warn('live token denied', {
      traceId,
      userId: user.id,
      schoolId: caller.schoolId ?? undefined,
      onlineClassId,
      reason: decision.reason,
    })

    // Record the denial on the session row itself when it's a lock
    // rejection, so there's an audit trail of "why did this session
    // never go live" without cross-referencing billing history after
    // the fact (see architecture doc §9). Best-effort — never blocks
    // the response.
    if (decision.reason === 'school_locked' && session) {
      admin
        .from('online_classes')
        .update({ locked_at: new Date().toISOString() })
        .eq('id', session.id)
        .then(() => {})
    }

    return NextResponse.json(
      { error: REASON_MESSAGE[decision.reason] },
      { status: REASON_STATUS[decision.reason] ?? 403 }
    )
  }

  // First host to mint a token for a not-yet-provisioned session claims
  // the room name. Uses the caller's own (RLS-scoped) client, not the
  // admin client — the RLS update policy independently enforces the same
  // is_class_teacher/principal check decideLiveClassAccess just made
  // (defense in depth), and the tamper-prevention trigger added in the
  // Phase 0 migration guarantees this can only ever happen once per row.
  if (decision.role === 'host' && session) {
    const room = roomNameFor(decision.schoolId, decision.onlineClassId)
    await supabase
      .from('online_classes')
      .update({ provider: 'livekit', livekit_room_name: room })
      .eq('id', session.id)
      .is('livekit_room_name', null) // no-op if already provisioned; trigger would reject a change anyway
  }

  const token = await mintLiveClassToken({
    identity: user.id,
    displayName: caller.fullName ?? user.email ?? 'Participant',
    schoolId: decision.schoolId,
    onlineClassId: decision.onlineClassId,
    role: decision.role,
    // Only a host ever gets publish rights at token-mint time. A student's
    // mic/camera permission is never taken from the request body — it's
    // granted live, after connection, only via /api/live/permission,
    // which independently re-verifies the requester is the session's
    // host before touching anyone's permissions. See livekit.ts.
    allowVideo: decision.role === 'host',
  })

  await auditLog(supabase, {
    actorId: user.id,
    action: 'live_class.token_issued',
    targetTable: 'online_classes',
    targetId: decision.onlineClassId,
    metadata: { role: decision.role, traceId },
  })

  return NextResponse.json({
    token,
    url: process.env.NEXT_PUBLIC_LIVEKIT_URL,
    role: decision.role,
    roomName: roomNameFor(decision.schoolId, decision.onlineClassId),
  })
}
