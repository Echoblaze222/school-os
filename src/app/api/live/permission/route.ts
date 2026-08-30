// src/app/api/live/permission/route.ts
//
// Lets the session host grant or revoke a connected student's ability to
// publish audio/video, live, without the student needing to reconnect
// with a new token. This is the server-side backing for "teacher allows
// a raised hand to speak" — the raise-hand REQUEST itself travels over
// LiveKit's data channel (see the client hook), but the actual permission
// change goes through this authenticated, re-verified endpoint, never a
// client-to-client message, because publish rights are a security
// decision, not just a UI state toggle (per the Phase 1 requirement:
// "Do not implement student permissions as frontend-only state").
//
// Re-runs the exact same decideLiveClassAccess check the token endpoint
// uses, rather than trusting that "this browser already has a host
// token" — a host token from ten minutes ago doesn't prove the caller is
// still authorized right now (school could have been locked since).

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
} from '@/lib/liveClass/authorize'
import { setParticipantPublishPermission } from '@/lib/liveClass/livekit'

export async function POST(req: Request) {
  const traceId = newTraceId()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  let body: {
    onlineClassId?: string
    participantIdentity?: string // the student's profiles.id, never trusted for WHO the caller is — only WHOSE permission is being changed
    canPublishAudio?: boolean
    canPublishVideo?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const { onlineClassId, participantIdentity } = body
  if (!onlineClassId || !participantIdentity) {
    return NextResponse.json({ error: 'onlineClassId and participantIdentity are required.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const rl = await checkRateLimit(admin, 'live_class_permission', user.id, 60, 60)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: rl.errorResponse?.error ?? 'Too many requests.' },
      { status: rl.errorResponse?.status ?? 429 }
    )
  }

  const caller = await loadCallerProfile(supabase, user.id)
  if (!caller) return NextResponse.json({ error: "We couldn't find your profile." }, { status: 403 })

  const [session, schoolLock] = await Promise.all([
    loadOnlineClass(supabase, onlineClassId),
    checkSubscription(user.id),
  ])
  const isClassTeacher = session ? await isAssignedClassTeacher(supabase, user.id, session.class_id) : false

  const decision = decideLiveClassAccess({
    caller,
    session,
    isClassTeacher,
    // These two routes only ever authorize the HOST path (checked via
    // decision.role === 'host' below) — enrollment only matters for the
    // student-participant path in decideLiveClassAccess, so it's
    // irrelevant here. Always false rather than actually querying
    // student_profiles, since a caller reaching the host check doesn't
    // depend on it either way.
    isEnrolledStudent: false,
    schoolLock: { locked: schoolLock.locked },
  })

  // Only the host may change anyone's publish permission. A participant
  // (even a legitimately-connected one) gets the same denial a
  // cross-school caller would — this endpoint has exactly one authorized
  // caller per session: its host.
  if (!decision.ok || decision.role !== 'host') {
    logger.warn('live permission change denied', {
      traceId, userId: user.id, onlineClassId,
      reason: decision.ok ? 'not_host' : decision.reason,
    })
    return NextResponse.json({ error: 'Only the class host can change participant permissions.' }, { status: 403 })
  }

  // participantIdentity must belong to this school too — otherwise a host
  // in School A could probe/target an arbitrary user id from School B.
  // Cheap, worthwhile check even though LiveKit itself scopes the update
  // to this specific room (a mismatched identity just no-ops on LiveKit's
  // side) — this way the caller gets a clear error instead of a silent
  // no-op that looks like success.
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', participantIdentity)
    .eq('school_id', decision.schoolId)
    .maybeSingle()

  if (!targetProfile) {
    return NextResponse.json({ error: 'That participant is not part of this school.' }, { status: 404 })
  }

  try {
    await setParticipantPublishPermission({
      schoolId: decision.schoolId,
      onlineClassId: decision.onlineClassId,
      participantIdentity,
      canPublishAudio: !!body.canPublishAudio,
      canPublishVideo: !!body.canPublishVideo,
    })
  } catch (err) {
    // Most common cause: the target participant isn't currently connected
    // to the room (already left). Not a server error — report it plainly.
    logger.warn('live permission change failed', { traceId, onlineClassId, participantIdentity, error: (err as Error).message })
    return NextResponse.json({ error: "Couldn't update that participant — they may have already left." }, { status: 409 })
  }

  await auditLog(supabase, {
    actorId: user.id,
    action: 'live_class.permission_changed',
    targetTable: 'online_classes',
    targetId: decision.onlineClassId,
    metadata: { traceId, participantIdentity, canPublishAudio: !!body.canPublishAudio, canPublishVideo: !!body.canPublishVideo },
  })

  return NextResponse.json({ ok: true })
}
