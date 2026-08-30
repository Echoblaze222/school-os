// src/app/api/live/webhook/route.ts
//
// Receives LiveKit's server-to-server webhooks (room_started, room_finished,
// participant_joined, participant_left, egress_ended, etc). Signature is
// verified via LiveKit's own WebhookReceiver (not a hand-rolled HMAC check
// like the Paystack webhook — LiveKit's signing scheme isn't a plain
// HMAC-over-raw-body match, so we defer to their SDK) BEFORE anything in
// the body is trusted or written to Postgres.
//
// Writes go through the admin (service-role) client, same reasoning as
// every other webhook in this codebase: this is the one place allowed to
// write live_session_participants / class_recordings, since both tables
// deliberately have no client-facing INSERT/UPDATE policy (Phase 0
// migration) — their integrity depends on only ever reflecting what
// LiveKit's signed webhook actually reported.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { withIdempotency } from '@/lib/idempotency'
import { logger, newTraceId } from '@/lib/logger'
import { getWebhookReceiver } from '@/lib/liveClass/livekit'
import { markLiveClassAttendance } from '@/lib/liveClass/attendance'

// room name is `{school_id}:{online_class_id}` — see roomNameFor() in
// livekit.ts. Parsing it back out here is the one place that format is
// depended on in reverse; if that ever changes, this must change with it.
function parseRoomName(name: string | undefined): { schoolId: string; onlineClassId: string } | null {
  if (!name) return null
  const [schoolId, onlineClassId] = name.split(':')
  if (!schoolId || !onlineClassId) return null
  return { schoolId, onlineClassId }
}

export async function POST(req: Request) {
  const traceId = newTraceId()
  const rawBody = await req.text()
  const authHeader = req.headers.get('authorization') ?? undefined

  const receiver = getWebhookReceiver()
  let event: Awaited<ReturnType<typeof receiver.receive>>
  try {
    event = await receiver.receive(rawBody, authHeader)
  } catch (err) {
    logger.warn('livekit webhook invalid signature', { traceId, error: (err as Error).message })
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  const admin = createAdminClient()

  const outcome = await withIdempotency(admin, 'livekit_webhook', event.id, async () => {
    switch (event.event) {
      case 'participant_joined': {
        const parsed = parseRoomName(event.room?.name)
        if (!parsed || !event.participant) return { handled: false, reason: 'missing room/participant' }

        // Host identification: via the `role` attribute set at token-mint
        // time (see livekit.ts), NOT `permission.roomAdmin` — that field
        // doesn't exist on the runtime ParticipantPermission protocol
        // message; roomAdmin/roomRecord are token-grant-only concepts.
        const isHost = event.participant.attributes?.role === 'host'
        await admin.from('live_session_participants').insert({
          school_id: parsed.schoolId,
          online_class_id: parsed.onlineClassId,
          user_id: event.participant.identity, // identity == profiles.id, set at token mint time
          role: isHost ? 'host' : 'participant',
          livekit_participant_sid: event.participant.sid,
        })

        // Attendance write-through: only for students, only on join (not
        // on every reconnect — markLiveClassAttendance is itself
        // idempotent per day, so a reconnect just no-ops here rather than
        // needing special-casing). Best-effort: a failure here must never
        // fail the webhook response, or LiveKit will retry the whole
        // event and re-attempt an insert that likely already succeeded.
        if (!isHost) {
          try {
            const { data: profile } = await admin
              .from('profiles').select('role').eq('id', event.participant.identity).maybeSingle()
            if (profile?.role === 'student') {
              const { data: session } = await admin
                .from('online_classes').select('class_id, teacher_id').eq('id', parsed.onlineClassId).maybeSingle()
              if (session) {
                const result = await markLiveClassAttendance(admin, {
                  schoolId: parsed.schoolId,
                  classId: session.class_id,
                  studentId: event.participant.identity,
                  teacherId: session.teacher_id,
                })
                if (result.error) logger.warn('attendance write-through failed', { traceId, onlineClassId: parsed.onlineClassId, error: result.error })
              }
            }
          } catch (err) {
            logger.warn('attendance write-through threw', { traceId, error: (err as Error).message })
          }
        }

        return { handled: 'participant_joined', onlineClassId: parsed.onlineClassId }
      }

      case 'participant_left': {
        const parsed = parseRoomName(event.room?.name)
        if (!parsed || !event.participant) return { handled: false, reason: 'missing room/participant' }

        // Close the most recent open row for this participant in this
        // session (left_at is null). Matched by livekit_participant_sid,
        // not just user_id, so a participant who reconnects mid-class
        // gets a distinct join/leave row per connection rather than one
        // row silently overwritten.
        const leftAt = new Date()
        const { data: openRow } = await admin
          .from('live_session_participants')
          .select('id, joined_at')
          .eq('online_class_id', parsed.onlineClassId)
          .eq('livekit_participant_sid', event.participant.sid)
          .is('left_at', null)
          .maybeSingle()

        if (openRow) {
          const durationSeconds = Math.max(
            0,
            Math.round((leftAt.getTime() - new Date(openRow.joined_at).getTime()) / 1000)
          )
          await admin
            .from('live_session_participants')
            .update({ left_at: leftAt.toISOString(), duration_seconds: durationSeconds })
            .eq('id', openRow.id)
        }
        return { handled: 'participant_left', onlineClassId: parsed.onlineClassId }
      }

      case 'room_started': {
        const parsed = parseRoomName(event.room?.name)
        if (!parsed) return { handled: false, reason: 'missing room' }
        await admin
          .from('online_classes')
          .update({ is_live: true, started_at: new Date().toISOString() })
          .eq('id', parsed.onlineClassId)
        return { handled: 'room_started', onlineClassId: parsed.onlineClassId }
      }

      case 'room_finished': {
        const parsed = parseRoomName(event.room?.name)
        if (!parsed) return { handled: false, reason: 'missing room' }
        await admin
          .from('online_classes')
          .update({ is_live: false, ended_at: new Date().toISOString() })
          .eq('id', parsed.onlineClassId)
        return { handled: 'room_finished', onlineClassId: parsed.onlineClassId }
      }

      case 'egress_ended': {
        const info = event.egressInfo
        const parsed = parseRoomName(info?.roomName)
        if (!parsed || !info) return { handled: false, reason: 'missing egress info' }

        const file = info.fileResults?.[0]
        if (!file) {
          // Egress ended without producing a file (e.g. a room with no
          // participants ever published, or the egress failed) — nothing
          // to record. Not an error condition, just nothing to do.
          return { handled: 'egress_ended_no_file', onlineClassId: parsed.onlineClassId }
        }

        await admin.from('class_recordings').upsert(
          {
            school_id: parsed.schoolId,
            online_class_id: parsed.onlineClassId,
            storage_key: file.location,
            duration_seconds: Number(file.duration ?? 0n) || null,
            size_bytes: Number(file.size ?? 0n) || null,
            status: 'ready',
          },
          { onConflict: 'storage_key' }
        )
        return { handled: 'egress_ended', onlineClassId: parsed.onlineClassId }
      }

      default:
        // Every other event type (track_published, ingress_*, etc.) is
        // acknowledged but intentionally not acted on yet — nothing in
        // Phase 0/1 needs them. Returning a 200 here matters: LiveKit
        // retries on non-2xx, and there's nothing productive a retry of
        // an unhandled event type would accomplish.
        return { handled: false, reason: `unhandled event type: ${event.event}` }
    }
  })

  if (outcome.status === 'unavailable') {
    // Idempotency check itself failed — fail closed, same reasoning as
    // rateLimit.ts and idempotency.ts elsewhere: better to have LiveKit
    // retry than to risk double-processing an attendance/recording event.
    logger.error('livekit webhook idempotency check failed', { traceId, event: event.event })
    return NextResponse.json({ error: 'Temporarily unavailable' }, { status: 503 })
  }
  if (outcome.status === 'conflict') {
    // Same event delivery already in flight — tell LiveKit not to retry.
    return NextResponse.json({ status: 'already processing' }, { status: 200 })
  }

  logger.info('livekit webhook processed', { traceId, event: event.event })
  return NextResponse.json({ status: 'ok' }, { status: 200 })
}
