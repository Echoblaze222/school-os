// src/lib/pushNotify.ts
// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrapper — call this from any server route that inserts a
// notification row, so the user also gets a real-time push to their device.
//
// Usage (from any API route):
//   import { pushNotify } from '@/lib/pushNotify'
//   await pushNotify(userId, { title: 'Fee received', body: '₦5,000 confirmed', url: '/dashboard/parent' })
//
// This is a fire-and-forget: it doesn't throw if push fails (e.g. user
// has no push subscription, or VAPID isn't configured — that's normal).
// ─────────────────────────────────────────────────────────────────────────────

import { sendPushToUsers, type PushPayload } from '@/lib/webpush'

export type { PushPayload }

/**
 * Send a push notification to a single user.
 * Fire-and-forget — does not throw.
 */
export async function pushNotify(userId: string, payload: PushPayload): Promise<void> {
  try {
    await sendPushToUsers([userId], payload)
  } catch {
    // Silently ignore — push is best-effort
  }
}

/**
 * Send a push notification to multiple users.
 * Fire-and-forget — does not throw.
 */
export async function pushNotifyMany(userIds: string[], payload: PushPayload): Promise<void> {
  if (!userIds.length) return
  try {
    await sendPushToUsers(userIds, payload)
  } catch {
    // Silently ignore
  }
}
