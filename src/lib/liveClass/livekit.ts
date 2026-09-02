// src/lib/liveClass/livekit.ts
//
// Server-only wrapper around livekit-server-sdk. LIVEKIT_API_KEY and
// LIVEKIT_API_SECRET are read from process.env here and nowhere else in
// the live-class code — this file must never be imported from a 'use
// client' component or a client bundle. (There is no NEXT_PUBLIC_ prefix
// on either variable, which is what actually keeps them out of the
// client JS bundle; the naming convention itself is the enforcement
// mechanism Next.js provides, same as every other secret already in this
// codebase — see PAYSTACK_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY.)
//
// The only thing that reaches the client is the short-lived signed JWT
// this file produces, and the LiveKit server URL (which is not a secret —
// it's a normal wss:// endpoint, same trust level as a public API base
// URL, set via NEXT_PUBLIC_LIVEKIT_URL for the client SDK to connect to).

import { AccessToken, EgressClient, RoomServiceClient, WebhookReceiver, type AccessTokenOptions } from 'livekit-server-sdk'
import { EncodedFileOutput, EncodedFileType, S3Upload, TrackSource } from '@livekit/protocol'
import type { LiveClassRole } from './authorize'

function getApiUrl(): string {
  // Server-to-server REST API base (https://…), distinct from
  // NEXT_PUBLIC_LIVEKIT_URL (wss://…) which the *browser* SDK connects
  // with. Same key/secret, different variable — mixing these up sends
  // the client SDK a URL it can't establish signaling over.
  const url = process.env.LIVEKIT_API_URL
  if (!url) throw new Error('LIVEKIT_API_URL is not configured')
  return url
}

function getApiKey(): string {
  const key = process.env.LIVEKIT_API_KEY
  if (!key) throw new Error('LIVEKIT_API_KEY is not configured')
  return key
}

function getApiSecret(): string {
  const secret = process.env.LIVEKIT_API_SECRET
  if (!secret) throw new Error('LIVEKIT_API_SECRET is not configured')
  return secret
}

/**
 * Deterministic, tenant-namespaced room name. Never derive this from
 * anything client-supplied — always from the online_classes row itself
 * (school_id + id), so cross-school room name collisions are structurally
 * impossible rather than policy-dependent. See architecture doc §6.
 */
export function roomNameFor(schoolId: string, onlineClassId: string): string {
  return `${schoolId}:${onlineClassId}`
}

/**
 * Same tenant-namespacing guarantee as roomNameFor, for a general
 * (non-class) meeting — PTA, staff meeting, etc. (Phase 4). Deliberately
 * a DIFFERENT format (`:meeting:` infix) from roomNameFor's, not just a
 * different id space — this is what lets the webhook (parseRoomName)
 * tell the two kinds of room apart unambiguously from the room name
 * alone, with no risk of a class id and a meeting id ever colliding.
 */
export function meetingRoomNameFor(schoolId: string, meetingId: string): string {
  return `${schoolId}:meeting:${meetingId}`
}

const TOKEN_TTL_SECONDS = 60 * 60 * 4 // 4 hours — comfortably covers a single class period plus buffer; short enough that a leaked token doesn't stay useful long

/**
 * Shared primitive behind both mintLiveClassToken and mintMeetingToken
 * (Phase 4) — takes an already-computed room name rather than knowing
 * anything about classes or meetings itself, so the two callers can't
 * drift apart in how they encode grants. Not exported: callers go
 * through the class- or meeting-specific wrapper, which is what decides
 * (and documents) which room-naming scheme applies.
 */
async function mintRoomToken(params: {
  room: string
  identity: string
  displayName: string
  role: LiveClassRole
  allowVideo?: boolean
}): Promise<string> {
  const { room, identity, displayName, role, allowVideo } = params

  const options: AccessTokenOptions = {
    identity,
    name: displayName,
    ttl: TOKEN_TTL_SECONDS,
    // Client-visible role marker (via participant.attributes at runtime).
    // This is NOT a security control — it's purely so the room UI can
    // identify "which connected participant is the host" to render their
    // video prominently and to distinguish teacher from student in the
    // participant list. The actual authorization (what this participant
    // is ALLOWED to do) is entirely the grant below and the live
    // permission updates in setParticipantPublishPermission — a student
    // can't get real host powers by tampering with this attribute
    // because nothing security-relevant reads it; it's display-only.
    attributes: { role },
  }

  const at = new AccessToken(getApiKey(), getApiSecret(), options)

  if (role === 'host') {
    at.addGrant({
      room,
      roomJoin: true,
      roomAdmin: true,   // mute/remove participants, per the moderation requirement
      roomRecord: true,  // permitted to start/stop Egress from the client SDK
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    })
  } else {
    // Participant default per Phase 1 spec: NO publish permission at all —
    // not even microphone. Audio/video publishing is granted live, after
    // connection, only through the teacher's explicit authorization flow
    // (see /api/live/permission/route.ts, which calls
    // RoomServiceClient.updateParticipant on the already-connected
    // participant — it does not require minting a new token). This
    // function's `allowVideo` param only matters for the one path where a
    // participant is trusted with publish rights from the moment they
    // join — currently unused for role: 'participant', reserved for a
    // future "co-teacher" style role if one is ever added.
    //
    // canPublishData stays true regardless — chat and raise-hand ride the
    // data channel, which is intentionally independent of audio/video
    // publish rights (see architecture doc: "prefer LiveKit's data
    // channel for raise hand/chat/permission notifications").
    at.addGrant({
      room,
      roomJoin: true,
      canPublish: allowVideo === true, // false by default; see comment above
      canPublishSources: allowVideo ? [TrackSource.CAMERA, TrackSource.MICROPHONE] : [],
      canSubscribe: true,
      canPublishData: true,
    })
  }

  return at.toJwt()
}

export interface MintTokenParams {
  identity: string        // the caller's profiles.id — never a client-supplied display name
  displayName: string
  schoolId: string
  onlineClassId: string
  role: LiveClassRole
  /** Participant opted into publishing video, not just audio. Defaults to audio+data only. */
  allowVideo?: boolean
}

/**
 * Mints a room-scoped, role-scoped LiveKit access token for a CLASS
 * session. This is the ONLY place a class token is created — callers
 * must have already run the caller through decideLiveClassAccess()
 * (authorize.ts) before calling this; this function does not re-check
 * authorization itself, it only encodes whatever role it's told into
 * token grants. Signature/behavior unchanged since Phase 1 — this is now
 * a thin wrapper over the shared mintRoomToken primitive (Phase 4), not
 * a rewrite; see __tests__/livekit.test.ts, unmodified by that refactor.
 */
export async function mintLiveClassToken(params: MintTokenParams): Promise<string> {
  const room = roomNameFor(params.schoolId, params.onlineClassId)
  return mintRoomToken({ room, identity: params.identity, displayName: params.displayName, role: params.role, allowVideo: params.allowVideo })
}

export interface MintMeetingTokenParams {
  identity: string
  displayName: string
  schoolId: string
  meetingId: string
  role: LiveClassRole
  allowVideo?: boolean
}

/**
 * Mints a token for a general MEETING (PTA, staff meeting — Phase 4).
 * Same rules as mintLiveClassToken — caller must have already run
 * decideMeetingAccess() (meetingAuthorize.ts) first; this function does
 * not authorize anything itself.
 */
export async function mintMeetingToken(params: MintMeetingTokenParams): Promise<string> {
  const room = meetingRoomNameFor(params.schoolId, params.meetingId)
  return mintRoomToken({ room, identity: params.identity, displayName: params.displayName, role: params.role, allowVideo: params.allowVideo })
}

/**
 * Verifies an inbound LiveKit webhook's signature and parses it. Mirrors
 * the Paystack webhook's crypto.createHmac verification pattern
 * conceptually (verify before trusting anything in the body), using
 * LiveKit's own WebhookReceiver rather than hand-rolled HMAC since
 * LiveKit's signing scheme isn't a plain HMAC-over-body match.
 */
export function getWebhookReceiver(): WebhookReceiver {
  return new WebhookReceiver(getApiKey(), getApiSecret())
}

/**
 * Server-to-server REST client for live, already-connected-room actions:
 * changing a participant's permissions mid-session, or force-ending a
 * room. Distinct from token minting — this doesn't hand anything to a
 * client, it acts directly on LiveKit's server. Never imported client-side
 * (same rule as the rest of this file).
 */
export function getRoomServiceClient(): RoomServiceClient {
  return new RoomServiceClient(getApiUrl(), getApiKey(), getApiSecret())
}

/**
 * Shared primitive behind setParticipantPublishPermission (class) and
 * setMeetingParticipantPublishPermission (Phase 4) — takes a room name
 * directly. Not exported for the same reason mintRoomToken isn't: the
 * room-naming decision belongs to the class/meeting-specific wrapper.
 */
async function setRoomParticipantPublishPermission(params: {
  room: string
  participantIdentity: string
  canPublishAudio: boolean
  canPublishVideo: boolean
}): Promise<void> {
  const { room, participantIdentity, canPublishAudio, canPublishVideo } = params
  const sources: TrackSource[] = []
  if (canPublishVideo) sources.push(TrackSource.CAMERA)
  if (canPublishAudio) sources.push(TrackSource.MICROPHONE)

  const client = getRoomServiceClient()
  await client.updateParticipant(room, participantIdentity, {
    permission: {
      canPublish: sources.length > 0,
      canPublishSources: sources,
      canSubscribe: true,   // must be re-stated — see doc comment above
      canPublishData: true, // must be re-stated — chat/raise-hand must never be silently revoked by a mic grant/revoke
    },
  })
}

/**
 * Grants or revokes a connected student's ability to publish audio/video,
 * live, without requiring them to reconnect with a new token. This is the
 * "teacher authorizes a raised hand" action. Always sets the FULL
 * permission set on every call — LiveKit updates permissions atomically,
 * so omitting canSubscribe/canPublishData here would silently revoke
 * them too, not just leave them unchanged.
 *
 * Caller is responsible for verifying the requester is actually the
 * session's host before calling this — see /api/live/permission/route.ts.
 * Signature/behavior unchanged since Phase 1 — now a thin wrapper, same
 * as mintLiveClassToken above.
 */
export async function setParticipantPublishPermission(params: {
  schoolId: string
  onlineClassId: string
  participantIdentity: string
  canPublishAudio: boolean
  canPublishVideo: boolean
}): Promise<void> {
  const room = roomNameFor(params.schoolId, params.onlineClassId)
  return setRoomParticipantPublishPermission({ room, participantIdentity: params.participantIdentity, canPublishAudio: params.canPublishAudio, canPublishVideo: params.canPublishVideo })
}

/** Same as setParticipantPublishPermission, for a general meeting (Phase 4). */
export async function setMeetingParticipantPublishPermission(params: {
  schoolId: string
  meetingId: string
  participantIdentity: string
  canPublishAudio: boolean
  canPublishVideo: boolean
}): Promise<void> {
  const room = meetingRoomNameFor(params.schoolId, params.meetingId)
  return setRoomParticipantPublishPermission({ room, participantIdentity: params.participantIdentity, canPublishAudio: params.canPublishAudio, canPublishVideo: params.canPublishVideo })
}

/**
 * Shared primitive behind endLiveClassRoom and endMeetingRoom (Phase 4).
 */
async function deleteRoomByName(room: string): Promise<void> {
  const client = getRoomServiceClient()
  try {
    await client.deleteRoom(room)
  } catch (err) {
    // Room already gone / never started — nothing to clean up.
    // Anything else is logged by the caller via the route's own try/catch.
    if (!/not.?found/i.test((err as Error).message ?? '')) throw err
  }
}

/**
 * Force-ends a room immediately (used by the teacher's "End Class"
 * button) rather than waiting for LiveKit's empty-room timeout. Safe to
 * call on a room that doesn't exist / already ended — LiveKit's
 * deleteRoom is a no-op in that case, not an error condition worth
 * surfacing to the caller. Signature/behavior unchanged since Phase 1.
 */
export async function endLiveClassRoom(schoolId: string, onlineClassId: string): Promise<void> {
  return deleteRoomByName(roomNameFor(schoolId, onlineClassId))
}

/** Same as endLiveClassRoom, for a general meeting (Phase 4). */
export async function endMeetingRoom(schoolId: string, meetingId: string): Promise<void> {
  return deleteRoomByName(meetingRoomNameFor(schoolId, meetingId))
}

// ─────────────────────────────────────────────────────────────────────────
// Recording (Phase 2): LiveKit Egress -> Cloudflare R2
// ─────────────────────────────────────────────────────────────────────────
// R2 credentials are read here, same isolation rule as the LiveKit
// key/secret above — no NEXT_PUBLIC_ prefix, never returned to a client.
// R2 is S3-compatible, so this uses LiveKit Egress's built-in S3Upload
// output with R2's custom endpoint rather than a LiveKit-specific
// integration — LiveKit has no R2-specific code path, and doesn't need one.

function getEgressClient(): EgressClient {
  return new EgressClient(getApiUrl(), getApiKey(), getApiSecret())
}

interface R2Config {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucket: string
}

export function getR2Config(): R2Config {
  const accountId = process.env.R2_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error('R2 recording storage is not fully configured (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET)')
  }
  return { accountId, accessKeyId, secretAccessKey, bucket }
}

/** R2's S3-compatible endpoint, derived from the account ID rather than a separately-configured URL — one less thing to get out of sync. */
export function getR2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`
}

/**
 * Object key a recording will be stored under. Tenant-namespaced the same
 * way room names are (school_id/online_class_id/...), for the same
 * reason: structural impossibility of a cross-school collision, not a
 * policy that has to be remembered and re-applied correctly every time.
 * Exported (rather than a private helper) specifically so this pure,
 * deterministic mapping is unit-testable without mocking the Egress
 * client — see __tests__/livekit.test.ts.
 */
export function recordingObjectKey(schoolId: string, onlineClassId: string, startedAtMs: number): string {
  return `recordings/${schoolId}/${onlineClassId}/${startedAtMs}.mp4`
}

/** Same as recordingObjectKey, for a general meeting (Phase 4) — distinct path prefix so a class recording and a meeting recording can never collide even if the raw ids somehow did. */
export function meetingRecordingObjectKey(schoolId: string, meetingId: string, startedAtMs: number): string {
  return `recordings/${schoolId}/meeting/${meetingId}/${startedAtMs}.mp4`
}

/**
 * Shared primitive behind startClassRecording and startMeetingRecording
 * (Phase 4) — takes the room name and object key directly.
 */
async function startRoomRecording(params: { room: string; objectKey: string }): Promise<{ egressId: string; objectKey: string }> {
  const { room, objectKey } = params
  const r2 = getR2Config()

  const output = new EncodedFileOutput({
    fileType: EncodedFileType.MP4,
    filepath: objectKey,
    output: {
      case: 's3',
      value: new S3Upload({
        accessKey: r2.accessKeyId,
        secret: r2.secretAccessKey,
        region: 'auto',
        endpoint: getR2Endpoint(r2.accountId),
        bucket: r2.bucket,
        forcePathStyle: true, // recommended for S3-compatible non-AWS endpoints; unverified against a live R2 bucket in this environment — see Phase 2 summary
      }),
    },
  })

  const egress = await getEgressClient().startRoomCompositeEgress(room, output)
  return { egressId: egress.egressId, objectKey }
}

/**
 * Starts a room-composite (single merged stream — simplest for classroom
 * playback) recording, uploading directly to R2 as it records. Returns
 * the LiveKit egress ID, which the caller must persist
 * (online_classes.active_egress_id) so /api/live/recording/stop and the
 * "recording in progress" UI state both know which job is running,
 * without ever trusting a client to remember or supply it.
 *
 * Caller is responsible for verifying the requester is the session's
 * host before calling this — see /api/live/recording/start/route.ts.
 * Signature/behavior unchanged since Phase 2.
 */
export async function startClassRecording(params: {
  schoolId: string
  onlineClassId: string
}): Promise<{ egressId: string; objectKey: string }> {
  const room = roomNameFor(params.schoolId, params.onlineClassId)
  const objectKey = recordingObjectKey(params.schoolId, params.onlineClassId, Date.now())
  return startRoomRecording({ room, objectKey })
}

/** Same as startClassRecording, for a general meeting (Phase 4). Persists to school_meetings.active_egress_id, not online_classes. */
export async function startMeetingRecording(params: {
  schoolId: string
  meetingId: string
}): Promise<{ egressId: string; objectKey: string }> {
  const room = meetingRoomNameFor(params.schoolId, params.meetingId)
  const objectKey = meetingRecordingObjectKey(params.schoolId, params.meetingId, Date.now())
  return startRoomRecording({ room, objectKey })
}

/**
 * Stops an in-progress recording. Safe to call with an egress ID that's
 * already finished/stopped — that's a normal LiveKit API response, not an
 * error condition worth surfacing distinctly from any other failure.
 * Takes only an egress ID, nothing class-specific about it despite the
 * name (kept for signature stability) — reused as-is for meetings too,
 * see /api/live/recording/stop/route.ts's kind branch.
 */
export async function stopClassRecording(egressId: string): Promise<void> {
  await getEgressClient().stopEgress(egressId)
}
