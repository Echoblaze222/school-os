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

import { describe, it, expect, beforeAll } from 'vitest'
import { TokenVerifier } from 'livekit-server-sdk'
import { TrackSource } from '@livekit/protocol'
import { mintLiveClassToken, roomNameFor } from '../livekit'

const TEST_KEY = 'test-key'
const TEST_SECRET = 'test-secret-at-least-32-bytes-long-for-hmac'

beforeAll(() => {
  process.env.LIVEKIT_API_KEY = TEST_KEY
  process.env.LIVEKIT_API_SECRET = TEST_SECRET
})

const schoolId = '11111111-1111-1111-1111-111111111111'
const onlineClassId = 'dddddddd-0001-0001-0001-000000000001'

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

  async function verify(jwt: string) {
    return new TokenVerifier(TEST_KEY, TEST_SECRET).verify(jwt)
  }
})
