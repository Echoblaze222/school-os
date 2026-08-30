// src/app/api/live/end/route.ts
//
// Explicit "End Class" action. Without this, a session only ends when
// LiveKit's empty-room timeout elapses after the last participant
// leaves (room_finished webhook) — fine as a safety net, but a teacher
// pressing "End Class" should end it NOW, for everyone, immediately.
// Calls LiveKit's deleteRoom (disconnects every participant) and updates
// online_classes directly rather than waiting for the resulting
// room_finished webhook to arrive, so the UI reflects "ended" the moment
// the teacher acts, not whenever the webhook happens to be delivered.
// The webhook still fires and still updates the same fields — this is
// deliberately idempotent with that path, not a replacement for it (see
// online_classes update below, which is a no-op if already ended).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSubscription } from '@/lib/subscription'
import { auditLog } from '@/lib/auditLog'
import { logger, newTraceId } from '@/lib/logger'
import { decideLiveClassAccess, loadCallerProfile, loadOnlineClass, isAssignedClassTeacher } from '@/lib/liveClass/authorize'
import { endLiveClassRoom } from '@/lib/liveClass/livekit'

export async function POST(req: Request) {
  const traceId = newTraceId()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  let body: { onlineClassId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  if (!body.onlineClassId) return NextResponse.json({ error: 'onlineClassId is required.' }, { status: 400 })

  const caller = await loadCallerProfile(supabase, user.id)
  if (!caller) return NextResponse.json({ error: "We couldn't find your profile." }, { status: 403 })

  const [session, schoolLock] = await Promise.all([
    loadOnlineClass(supabase, body.onlineClassId),
    checkSubscription(user.id),
  ])
  const isClassTeacher = session ? await isAssignedClassTeacher(supabase, user.id, session.class_id) : false

  const decision = decideLiveClassAccess({
    caller,
    session,
    isClassTeacher,
    // Same reasoning as /api/live/permission — only the host path is
    // ever authorized by this route, enrollment doesn't apply.
    isEnrolledStudent: false,
    // Deliberately NOT gated on schoolLock here: if a school gets locked
    // WHILE a class is live, the host must still be able to end it
    // cleanly. Locking should stop new sessions from starting (enforced
    // in /api/live/token), not trap an in-progress one open.
    schoolLock: { locked: false },
  })

  if (!decision.ok || decision.role !== 'host') {
    logger.warn('live end denied', { traceId, userId: user.id, onlineClassId: body.onlineClassId })
    return NextResponse.json({ error: 'Only the class host can end this session.' }, { status: 403 })
  }

  try {
    await endLiveClassRoom(decision.schoolId, decision.onlineClassId)
  } catch (err) {
    logger.error('live end: LiveKit deleteRoom failed', { traceId, error: (err as Error).message })
    // Still proceed to mark the DB row ended below — the room may already
    // be gone (that's not an error, see endLiveClassRoom's own handling),
    // and even in a genuine failure case, reflecting "ended" in SchoolOS
    // is more useful to the teacher than leaving it stuck on "live".
  }

  const admin = createAdminClient()
  await admin
    .from('online_classes')
    .update({ is_live: false, ended_at: new Date().toISOString() })
    .eq('id', decision.onlineClassId)
    .eq('is_live', true) // no-op if the room_finished webhook already closed it out

  await auditLog(supabase, {
    actorId: user.id,
    action: 'live_class.ended_by_host',
    targetTable: 'online_classes',
    targetId: decision.onlineClassId,
    metadata: { traceId },
  })

  return NextResponse.json({ ok: true })
}
