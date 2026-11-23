// src/lib/offline/identity.ts
// CLIENT ONLY. Lets an offline page know who the phone belongs to WITHOUT a
// network call and without getSession(), which cannot be relied on offline once
// the access token (about an hour) has expired.
//
//  - The last-known user id is a non-secret UUID in localStorage. It is only a
//    key for looking up that user's saved copies; it grants no access to anything,
//    and every upload is still authorised by the server.
//  - The profile and school the page was built from are kept with savedView
//    (user-scoped, one user per phone, wiped on sign-out), minus anything that
//    looks like a credential.
//  - signOutFlow removes both.

import { loadView, saveView } from '@/lib/savedView/store'

const LAST_USER_KEY = 'schoolos_last_user'
const IDENTITY_VIEW = 'offline-identity'

/** How long saved screens stay usable offline. */
export const OFFLINE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface OfflineIdentity {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  school: any
}

export function rememberUser(userId: string): void {
  try {
    localStorage.setItem(LAST_USER_KEY, userId)
  } catch {
    // best effort
  }
}

export function readLastKnownUserId(): string | null {
  try {
    return localStorage.getItem(LAST_USER_KEY)
  } catch {
    return null
  }
}

export function forgetUser(): void {
  try {
    localStorage.removeItem(LAST_USER_KEY)
  } catch {
    // best effort
  }
}

// Keys that look like credentials are dropped before anything is stored on the
// device: password_hash, transaction_pin, reset_token, otp, secret, ...
const SENSITIVE_KEY = /(^|_)(password|passcode|pin|secret|token|hash|otp)(_|$)/i

export function scrubSensitive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(scrubSensitive) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY.test(key)) continue
      out[key] = scrubSensitive(v)
    }
    return out as T
  }
  return value
}

/** Call while online, from a screen that has the profile and school. */
export async function saveIdentity(userId: string, profile: unknown, school: unknown): Promise<void> {
  rememberUser(userId)
  await saveView(userId, IDENTITY_VIEW, scrubSensitive({ profile, school }))
}

export async function loadIdentity(userId: string): Promise<OfflineIdentity | null> {
  const saved = await loadView<OfflineIdentity>(userId, IDENTITY_VIEW, OFFLINE_MAX_AGE_MS)
  return saved?.data ?? null
}
