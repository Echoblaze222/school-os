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

import { AccessToken, RoomServiceClient, WebhookReceiver, type AccessTokenOptions } from 'livekit-server-sdk'
import { TrackSource } from '@livekit/protocol'
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

const TOKEN_TTL_SECONDS = 60 * 60 * 4 // 4 hours — comfortably covers a single class period plus buffer; short enough that a leaked token doesn't stay useful long

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
 * Mints a room-scoped, role-scoped LiveKit access token. This is the
 * ONLY place a token is created — callers must have already run the
 * caller through decideLiveClassAccess() (authorize.ts) before calling
 * this; this function does not re-check authorization itself, it only
 * encodes whatever role it's told into token grants.
 */
export async function mintLiveClassToken(params: MintTokenParams): Promise<string> {
  const { identity, displayName, schoolId, onlineClassId, role, allowVideo } = params
  const room = roomNameFor(schoolId, onlineClassId)

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
 * Grants or revokes a connected student's ability to publish audio/video,
 * live, without requiring them to reconnect with a new token. This is the
 * "teacher authorizes a raised hand" action. Always sets the FULL
 * permission set on every call — LiveKit updates permissions atomically,
 * so omitting canSubscribe/canPublishData here would silently revoke
 * them too, not just leave them unchanged.
 *
 * Caller is responsible for verifying the requester is actually the
 * session's host before calling this — see /api/live/permission/route.ts.
 */
export async function setParticipantPublishPermission(params: {
  schoolId: string
  onlineClassId: string
  participantIdentity: string
  canPublishAudio: boolean
  canPublishVideo: boolean
}): Promise<void> {
  const { schoolId, onlineClassId, participantIdentity, canPublishAudio, canPublishVideo } = params
  const room = roomNameFor(schoolId, onlineClassId)
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
 * Force-ends a room immediately (used by the teacher's "End Class"
 * button) rather than waiting for LiveKit's empty-room timeout. Safe to
 * call on a room that doesn't exist / already ended — LiveKit's
 * deleteRoom is a no-op in that case, not an error condition worth
 * surfacing to the caller.
 */
export async function endLiveClassRoom(schoolId: string, onlineClassId: string): Promise<void> {
  const room = roomNameFor(schoolId, onlineClassId)
  const client = getRoomServiceClient()
  try {
    await client.deleteRoom(room)
  } catch (err) {
    // Room already gone / never started — nothing to clean up.
    // Anything else is logged by the caller via the route's own try/catch.
    if (!/not.?found/i.test((err as Error).message ?? '')) throw err
  }
}
