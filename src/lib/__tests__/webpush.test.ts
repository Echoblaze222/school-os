/* eslint-disable @typescript-eslint/no-explicit-any -- mocked third-party modules */
// src/lib/__tests__/webpush.test.ts
//
// Checks the offline-delivery settings sendPushToUsers hands to the push
// service: how long it should hold a message for a device with no connection,
// how urgent it is, and that each device's copy is stamped with its own user.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const sendNotification = vi.fn(async () => ({}))
const sendFcmToTokens = vi.fn(async () => ({ staleTokens: [] as string[] }))
let subscriptions: any[] = []

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...a: any[]) => (sendNotification as any)(...a) },
}))
vi.mock('@/lib/fcm', () => ({ sendFcmToTokens: (...a: any[]) => (sendFcmToTokens as any)(...a) }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({ in: async () => ({ data: subscriptions }) }),
      update: () => ({ eq: async () => ({}), in: async () => ({}) }),
      delete: () => ({ in: async () => ({}) }),
    }),
  }),
}))

import { sendPushToUsers, DEFAULT_PUSH_TTL_SECONDS } from '@/lib/webpush'

beforeEach(() => {
  sendNotification.mockClear()
  sendFcmToTokens.mockClear()
  process.env.VAPID_EMAIL = 'ops@example.test'
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'pub'
  process.env.VAPID_PRIVATE_KEY = 'priv'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service'
  subscriptions = [
    { endpoint: 'https://push/a', p256dh: 'k1', auth: 'a1', user_id: 'user-a', platform: 'web', fcm_token: null },
    { endpoint: 'https://push/b', p256dh: 'k2', auth: 'a2', user_id: 'user-b', platform: 'web', fcm_token: null },
    { endpoint: 'android:1', p256dh: null, auth: null, user_id: 'user-a', platform: 'android', fcm_token: 'tok' },
  ]
})

describe('sendPushToUsers - offline delivery', () => {
  it('holds messages for 3 days by default (was 24 hours) with high urgency', async () => {
    await sendPushToUsers(['user-a', 'user-b'], { title: 'T', body: 'B' })
    expect(DEFAULT_PUSH_TTL_SECONDS).toBe(259200)
    expect(sendNotification).toHaveBeenCalledTimes(2)
    for (const call of sendNotification.mock.calls as any[]) {
      expect(call[2]).toEqual({ TTL: 259200, urgency: 'high' })
    }
  })

  it('honours a caller-supplied ttl and urgency', async () => {
    await sendPushToUsers(['user-a'], { title: 'T', body: 'B', ttlSeconds: 604800, urgency: 'normal' })
    expect((sendNotification.mock.calls[0] as any[])[2]).toEqual({ TTL: 604800, urgency: 'normal' })
  })

  it('stamps each device\'s message with its own user id and the send time', async () => {
    await sendPushToUsers(['user-a', 'user-b'], { title: 'T', body: 'B', tag: 'same-tag' })
    const bodies = (sendNotification.mock.calls as any[]).map((c) => JSON.parse(c[1]))
    expect(bodies.map((b) => b.userId).sort()).toEqual(['user-a', 'user-b'])
    for (const b of bodies) {
      expect(typeof b.sentAt).toBe('number')
      expect(b.tag).toBe('same-tag')
    }
  })

  it('passes the same hold time to Android (FCM)', async () => {
    await sendPushToUsers(['user-a'], { title: 'T', body: 'B' })
    expect((sendFcmToTokens.mock.calls[0] as any[])[1].ttlSeconds).toBe(259200)
  })
})
