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

// Class room: `{school_id}:{online_class_id}` (roomNameFor, 2 segments).
// Meeting room: `{school_id}:meeting:{meeting_id}` (meetingRoomNameFor,
// 3 segments with a literal "meeting" middle segment) — Phase 4. This is
// the one place both formats are parsed back apart; if either format
// changes in livekit.ts, this must change with it.
type ParsedRoom =
  | { kind: 'class'; schoolId: string; onlineClassId: string }
  | { kind: 'meeting'; schoolId: string; meetingId: string }

function parseRoomName(name: string | undefined): ParsedRoom | null {
  if (!name) return null
  const parts = name.split(':')
  if (parts.length === 2) {
    const [schoolId, onlineClassId] = parts
    if (!schoolId || !onlineClassId) return null
    return { kind: 'class', schoolId, onlineClassId }
  }
  if (parts.length === 3 && parts[1] === 'meeting') {
    const [schoolId, , meetingId] = parts
    if (!schoolId || !meetingId) return null
    return { kind: 'meeting', schoolId, meetingId }
  }
  return null
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

        // Phase 4 scope: live_session_participants (join/leave audit
        // trail) and attendance write-through are both class-specific —
        // live_session_participants.online_class_id is a NOT NULL FK
        // into online_classes, and attendance has no meeting concept at
        // all. A general meeting currently gets NEITHER an audit trail
        // nor an attendance record. That's a real, known gap (not
        // silently decided) — flagged in the Phase 4 summary, not
        // extended here since it would mean either loosening
        // live_session_participants' NOT NULL constraint or building a
        // second, meeting-specific attendance table, both bigger
        // decisions than this webhook update should make on its own.
        if (parsed.kind === 'meeting') {
          return { handled: 'participant_joined_meeting_unaudited', meetingId: parsed.meetingId }
        }

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

        if (parsed.kind === 'meeting') {
          return { handled: 'participant_left_meeting_unaudited', meetingId: parsed.meetingId }
        }

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
        const table = parsed.kind === 'meeting' ? 'online_meetings' : 'online_classes'
        const id = parsed.kind === 'meeting' ? parsed.meetingId : parsed.onlineClassId
        await admin.from(table).update({ is_live: true, started_at: new Date().toISOString() }).eq('id', id)
        return { handled: 'room_started', id, kind: parsed.kind }
      }

      case 'room_finished': {
        const parsed = parseRoomName(event.room?.name)
        if (!parsed) return { handled: false, reason: 'missing room' }
        const table = parsed.kind === 'meeting' ? 'online_meetings' : 'online_classes'
        const id = parsed.kind === 'meeting' ? parsed.meetingId : parsed.onlineClassId
        await admin.from(table).update({ is_live: false, ended_at: new Date().toISOString() }).eq('id', id)
        return { handled: 'room_finished', id, kind: parsed.kind }
      }

      case 'egress_ended': {
        const info = event.egressInfo
        const parsed = parseRoomName(info?.roomName)
        if (!parsed || !info) return { handled: false, reason: 'missing egress info' }

        // Recording is no longer in progress regardless of whether it
        // produced a usable file — always clear this so the UI's
        // "recording in progress" state can't get stuck on, and so a new
        // recording can be started. Matched on egress ID, not just
        // "clear whatever's there", so a stale/out-of-order webhook
        // delivery can't clear a DIFFERENT, currently-active recording.
        const parentTable = parsed.kind === 'meeting' ? 'online_meetings' : 'online_classes'
        const parentId = parsed.kind === 'meeting' ? parsed.meetingId : parsed.onlineClassId
        await admin
          .from(parentTable)
          .update({ active_egress_id: null })
          .eq('id', parentId)
          .eq('active_egress_id', info.egressId)

        const file = info.fileResults?.[0]
        if (!file) {
          // Egress ended without producing a file (e.g. a room with no
          // participants ever published, or the egress failed) — nothing
          // to record. Not an error condition, just nothing to do.
          return { handled: 'egress_ended_no_file', id: parentId, kind: parsed.kind }
        }

        // storage_key is file.filename, NOT file.location: filename is
        // exactly the `filepath` this app specified when starting egress
        // (see startClassRecording/startMeetingRecording in livekit.ts) —
        // a plain object key we fully control the shape of. `location` is
        // LiveKit's own description of where it uploaded to, whose exact
        // format for an S3-compatible (non-AWS) endpoint like R2 isn't
        // something to depend on; using our own known key is what makes
        // generating a presigned R2 URL later reliable rather than
        // dependent on parsing an unfamiliar string.
        const DEFAULT_RETENTION_DAYS = 90
        const retentionExpiresAt = new Date(Date.now() + DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

        await admin.from('class_recordings').upsert(
          {
            school_id: parsed.schoolId,
            // Exactly one of these two is set (Phase 4 migration's
            // class_recordings_exactly_one_parent CHECK constraint
            // enforces this at the DB level too, not just here).
            online_class_id: parsed.kind === 'class' ? parsed.onlineClassId : null,
            online_meeting_id: parsed.kind === 'meeting' ? parsed.meetingId : null,
            storage_key: file.filename,
            // Number(bigint | undefined ?? 0) — plain 0, not the 0n BigInt
            // literal: this project's tsconfig targets ES2017, which
            // doesn't support BigInt literal syntax. Number() accepts a
            // bigint argument at runtime regardless of target (it's a
            // library call, not literal syntax), so this is just as
            // correct without tripping the target-version restriction.
            duration_seconds: Number(file.duration ?? 0) || null,
            size_bytes: Number(file.size ?? 0) || null,
            status: 'ready',
            // Fixed default for Phase 2. The architecture doc's tiered
            // retention (by subscription level) is a deliberate
            // simplification left for later — flagged again in the
            // Phase 2 summary, not silently assumed done.
            retention_expires_at: retentionExpiresAt,
          },
          { onConflict: 'storage_key' }
        )
        return { handled: 'egress_ended', id: parentId, kind: parsed.kind }
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
