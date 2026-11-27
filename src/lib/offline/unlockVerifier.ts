// src/lib/offline/unlockVerifier.ts
// CLIENT ONLY. Core of offline unlock (Decision B in docs/offline/PHASE3_DESIGN.md).
//
// What is stored: a random salt and a PBKDF2-HMAC-SHA256 hash of the password
// (600,000 iterations, the current OWASP figure), per user. Never the password.
//
// Limits, on purpose:
//  - 5 wrong tries, then the verifier is deleted and the person must unlock or
//    sign in while online. The counter is saved BEFORE each check, so closing
//    the app mid-check cannot dodge the limit, and it survives restarts.
//  - Only a SLOW hash protects a short password if someone can read the stored
//    value, so this is only enabled in the Android app, where app storage is
//    sandboxed (see offlineUnlock.ts for the gate). It is not a substitute for a
//    strong password.
//  - A password changed elsewhere is not known here until the next online
//    sign-in or unlock refreshes the verifier.
//
// No Capacitor import here, so it is easy to test.

import { getDb } from './db'

export const MAX_OFFLINE_ATTEMPTS = 5
export const DEFAULT_ITERATIONS = 600_000

export type OfflineCheck =
  | { result: 'ok' }
  | { result: 'wrong'; attemptsLeft: number }
  | { result: 'locked-out' }
  | { result: 'unavailable' }

function toB64(bytes: Uint8Array): string {
  let s = ''
  bytes.forEach((b) => {
    s += String.fromCharCode(b)
  })
  return btoa(s)
}

function fromB64(text: string) {
  const bin = atob(text)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await globalThis.crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** Constant-time comparison. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

/** Save (or replace) this user's verifier. Call after a password was just confirmed online. */
export async function storeVerifier(
  userId: string,
  password: string,
  iterations: number = DEFAULT_ITERATIONS,
): Promise<void> {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const hash = await derive(password, salt, iterations)
  await getDb().unlock.put({
    userId,
    salt: toB64(salt),
    hash: toB64(hash),
    iterations,
    failedAttempts: 0,
    createdAt: Date.now(),
  })
}

export async function checkVerifier(userId: string, password: string): Promise<OfflineCheck> {
  const db = getDb()
  const record = await db.unlock.get(userId)
  if (!record) return { result: 'unavailable' }

  if (record.failedAttempts >= MAX_OFFLINE_ATTEMPTS) {
    await db.unlock.delete(userId)
    return { result: 'locked-out' }
  }

  // Count the attempt first; it is cleared only on success.
  const used = record.failedAttempts + 1
  await db.unlock.update(userId, { failedAttempts: used })

  const derived = await derive(password, fromB64(record.salt), record.iterations)
  if (sameBytes(derived, fromB64(record.hash))) {
    await db.unlock.update(userId, { failedAttempts: 0 })
    return { result: 'ok' }
  }

  if (used >= MAX_OFFLINE_ATTEMPTS) {
    await db.unlock.delete(userId)
    return { result: 'locked-out' }
  }
  return { result: 'wrong', attemptsLeft: MAX_OFFLINE_ATTEMPTS - used }
}
