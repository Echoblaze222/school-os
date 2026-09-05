// src/lib/liveClass/__tests__/livekit.test.ts
//
// Unlike authorize.test.ts (which tests pure decision logic with no I/O),
// these tests exercise the real livekit-server-sdk: mint a token with
// mintLiveClassToken, then decode+cryptographically verify it with
// TokenVerifier (the same class LiveKit's own server uses to validate
// incoming tokens) and assert on the actual resulting grants. This is
// what caught the Phase 0 bug where canPublishSources was set to plain
// strings ('camera'/'microphone') instead of the TrackSource enum LiveKit
// actually expects — a mistake that would have silently produced tokens
// with meaningless/ignored grants rather than a compile error, since
// TypeScript widened the string literals but the SDK's runtime encoding
// depends on the enum's numeric values.

import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { TokenVerifier } from 'livekit-server-sdk'
import { TrackSource } from '@livekit/protocol'
import { mintLiveClassToken, roomNameFor, recordingObjectKey, getR2Endpoint, getR2Config, meetingRoomNameFor, mintMeetingToken, meetingRecordingObjectKey } from '../livekit'

const TEST_KEY = 'test-key'
const TEST_SECRET = 'test-secret-at-least-32-bytes-long-for-hmac'

beforeAll(() => {
  process.env.LIVEKIT_API_KEY = TEST_KEY
  process.env.LIVEKIT_API_SECRET = TEST_SECRET
})

const schoolId = '11111111-1111-1111-1111-111111111111'
const onlineClassId = 'dddddddd-0001-0001-0001-000000000001'

/** Module-scoped (not nested in a describe block) so every describe below — class tokens and meeting tokens alike — can use the same real decode+verify helper. */
async function verify(jwt: string) {
  return new TokenVerifier(TEST_KEY, TEST_SECRET).verify(jwt)
}

describe('mintLiveClassToken', () => {
  it('produces a token with the correct tenant-scoped room name', async () => {
    const jwt = await mintLiveClassToken({
      identity: 'teacher-1', displayName: 'Mrs. Adeyemi',
      schoolId, onlineClassId, role: 'host',
    })
    const verifier = new TokenVerifier(TEST_KEY, TEST_SECRET)
    const grants = await verifier.verify(jwt)
    expect(grants.video?.room).toBe(roomNameFor(schoolId, onlineClassId))
    expect(grants.video?.room).toBe(`${schoolId}:${onlineClassId}`)
  })

  it('host grants: roomAdmin, roomRecord, full publish/subscribe', async () => {
    const jwt = await mintLiveClassToken({
      identity: 'teacher-1', displayName: 'Mrs. Adeyemi',
      schoolId, onlineClassId, role: 'host',
    })
    const grants = await verify(jwt)
    expect(grants.video?.roomJoin).toBe(true)
    expect(grants.video?.roomAdmin).toBe(true)
    expect(grants.video?.roomRecord).toBe(true)
    expect(grants.video?.canPublish).toBe(true)
    expect(grants.video?.canSubscribe).toBe(true)
    expect(grants.video?.canPublishData).toBe(true)
  })

  it('participant (student) grants: NO publish rights by default, not even microphone — only after live teacher authorization', async () => {
    const jwt = await mintLiveClassToken({
      identity: 'student-1', displayName: 'Chidi',
      schoolId, onlineClassId, role: 'participant',
    })
    const grants = await verify(jwt)
    expect(grants.video?.roomJoin).toBe(true)
    expect(grants.video?.roomAdmin).toBeFalsy()      // students never get moderation rights
    expect(grants.video?.canPublish).toBe(false)      // <- the Phase 1 spec requirement
    expect(grants.video?.canPublishSources ?? []).toEqual([])
    expect(grants.video?.canSubscribe).toBe(true)     // can always hear/see the teacher
    expect(grants.video?.canPublishData).toBe(true)   // chat/raise-hand still work with zero media publish rights
  })

  it('two different online_classes in the same school produce two different room names (no accidental collision)', async () => {
    const jwtA = await mintLiveClassToken({ identity: 'x', displayName: 'x', schoolId, onlineClassId: 'aaaa', role: 'host' })
    const jwtB = await mintLiveClassToken({ identity: 'x', displayName: 'x', schoolId, onlineClassId: 'bbbb', role: 'host' })
    const [a, b] = await Promise.all([verify(jwtA), verify(jwtB)])
    expect(a.video?.room).not.toBe(b.video?.room)
  })

  it('the role attribute round-trips through the signed token — this is what the room UI and webhook use to identify the host (NOT a security check, just display/attribution)', async () => {
    const hostJwt = await mintLiveClassToken({ identity: 'teacher-1', displayName: 'Mrs. Adeyemi', schoolId, onlineClassId, role: 'host' })
    const studentJwt = await mintLiveClassToken({ identity: 'student-1', displayName: 'Chidi', schoolId, onlineClassId, role: 'participant' })
    const [hostGrants, studentGrants] = await Promise.all([verify(hostJwt), verify(studentJwt)])
    expect(hostGrants.attributes?.role).toBe('host')
    expect(studentGrants.attributes?.role).toBe('participant')
  })

  it('the same online_class in two different schools produces two different room names (tenant isolation holds even under an id collision)', async () => {
    const jwtA = await mintLiveClassToken({ identity: 'x', displayName: 'x', schoolId: 'school-a', onlineClassId: 'same-class-id', role: 'host' })
    const jwtB = await mintLiveClassToken({ identity: 'x', displayName: 'x', schoolId: 'school-b', onlineClassId: 'same-class-id', role: 'host' })
    const [a, b] = await Promise.all([verify(jwtA), verify(jwtB)])
    expect(a.video?.room).not.toBe(b.video?.room)
  })
})

describe('meetingRoomNameFor (Phase 4)', () => {
  it('uses a distinct :meeting: infix so a meeting room can never collide with a class room name, even with the same raw id', () => {
    const classRoom = roomNameFor(schoolId, 'shared-id')
    const meetingRoom = meetingRoomNameFor(schoolId, 'shared-id')
    expect(classRoom).not.toBe(meetingRoom)
    expect(meetingRoom).toBe(`${schoolId}:meeting:shared-id`)
  })

  it('two different schools with the same meeting id produce different room names', () => {
    expect(meetingRoomNameFor('school-a', 'same-id')).not.toBe(meetingRoomNameFor('school-b', 'same-id'))
  })
})

describe('mintMeetingToken (Phase 4)', () => {
  it('mints a token scoped to the meeting room, distinct from a class room with the same raw id', async () => {
    const jwt = await mintMeetingToken({
      identity: 'staff-1', displayName: 'Mrs. Adeyemi', schoolId, meetingId: onlineClassId, role: 'host',
    })
    const grants = await verify(jwt)
    expect(grants.video?.room).toBe(meetingRoomNameFor(schoolId, onlineClassId))
    expect(grants.video?.room).not.toBe(roomNameFor(schoolId, onlineClassId))
  })

  it('participant grants for a meeting have the same zero-publish-by-default rule as a class', async () => {
    const jwt = await mintMeetingToken({
      identity: 'parent-1', displayName: 'Mrs. Okoro', schoolId, meetingId: onlineClassId, role: 'participant',
    })
    const grants = await verify(jwt)
    expect(grants.video?.canPublish).toBe(false)
    expect(grants.video?.canPublishData).toBe(true)
  })
})

describe('meetingRecordingObjectKey (Phase 4)', () => {
  it('uses a distinct path from a class recording, even with the same raw id and timestamp', () => {
    const classKey = recordingObjectKey(schoolId, 'shared-id', 1700000000000)
    const meetingKey = meetingRecordingObjectKey(schoolId, 'shared-id', 1700000000000)
    expect(classKey).not.toBe(meetingKey)
    expect(meetingKey).toBe(`recordings/${schoolId}/meeting/shared-id/1700000000000.mp4`)
  })
})

describe('recordingObjectKey (Phase 2)', () => {
  it('produces a tenant-namespaced key under recordings/{schoolId}/{onlineClassId}/', () => {
    const key = recordingObjectKey(schoolId, onlineClassId, 1700000000000)
    expect(key).toBe(`recordings/${schoolId}/${onlineClassId}/1700000000000.mp4`)
  })

  it('two different online_classes in the same school produce different keys (no accidental overwrite)', () => {
    const keyA = recordingObjectKey(schoolId, 'class-a', 1700000000000)
    const keyB = recordingObjectKey(schoolId, 'class-b', 1700000000000)
    expect(keyA).not.toBe(keyB)
  })

  it('the same online_class id in two different schools produces different keys — same tenant-isolation guarantee as room names', () => {
    const keyA = recordingObjectKey('school-a', 'same-class-id', 1700000000000)
    const keyB = recordingObjectKey('school-b', 'same-class-id', 1700000000000)
    expect(keyA).not.toBe(keyB)
  })

  it('two recordings for the same session started at different times do not collide', () => {
    const keyA = recordingObjectKey(schoolId, onlineClassId, 1700000000000)
    const keyB = recordingObjectKey(schoolId, onlineClassId, 1700000001000)
    expect(keyA).not.toBe(keyB)
  })
})

describe('getR2Endpoint (Phase 2)', () => {
  it('builds the R2 S3-compatible endpoint from the account ID', () => {
    expect(getR2Endpoint('abc123')).toBe('https://abc123.r2.cloudflarestorage.com')
  })
})

describe('getR2Config (Phase 2)', () => {
  const originalEnv = { ...process.env }
  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('throws a clear error when R2 env vars are not configured, rather than failing deep inside an S3 call', () => {
    delete process.env.R2_ACCOUNT_ID
    delete process.env.R2_ACCESS_KEY_ID
    delete process.env.R2_SECRET_ACCESS_KEY
    delete process.env.R2_BUCKET
    expect(() => getR2Config()).toThrow(/R2 recording storage is not fully configured/)
  })

  it('throws when only some R2 env vars are set (partial config is still a config error, not silently ignored)', () => {
    process.env.R2_ACCOUNT_ID = 'abc123'
    process.env.R2_ACCESS_KEY_ID = 'key'
    delete process.env.R2_SECRET_ACCESS_KEY
    delete process.env.R2_BUCKET
    expect(() => getR2Config()).toThrow(/R2 recording storage is not fully configured/)
  })

  it('returns the config when all four R2 env vars are set', () => {
    process.env.R2_ACCOUNT_ID = 'abc123'
    process.env.R2_ACCESS_KEY_ID = 'key'
    process.env.R2_SECRET_ACCESS_KEY = 'secret'
    process.env.R2_BUCKET = 'recordings-bucket'
    expect(getR2Config()).toEqual({
      accountId: 'abc123', accessKeyId: 'key', secretAccessKey: 'secret', bucket: 'recordings-bucket',
    })
  })
})
