// src/lib/pickupCode.ts
//
// One-time pickup codes. A code is 6 digits, shown to the parent once and
// stored only as an HMAC keyed by a server secret and bound to the row id, so
// the database alone can't reveal it and two people with the same digits get
// different hashes. Verification is constant-time.

import crypto from 'crypto'

export const PICKUP_CODE_LENGTH = 6
export const MAX_FAILED_ATTEMPTS = 5
export const LOCKOUT_MINUTES = 15

export function generatePickupCode(): string {
  return String(crypto.randomInt(0, 10 ** PICKUP_CODE_LENGTH)).padStart(PICKUP_CODE_LENGTH, '0')
}

export function normalizePickupCode(raw: unknown): string {
  return String(raw ?? '').replace(/\D/g, '')
}

export function isValidPickupCode(code: string): boolean {
  return new RegExp(`^\\d{${PICKUP_CODE_LENGTH}}$`).test(code)
}

export function hashPickupCode(code: string, rowId: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(`${rowId}:${code}`).digest('hex')
}

export function pickupCodeMatches(code: string, rowId: string, storedHash: string, secret: string): boolean {
  const a = Buffer.from(hashPickupCode(code, rowId, secret), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

/**
 * Server-only secret for the HMAC. PICKUP_CODE_SECRET is preferred; the
 * service-role key is a fallback so the feature works without new config.
 * Throws (fails closed) if neither exists.
 */
export function getPickupSecret(): string {
  const s = process.env.PICKUP_CODE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('No secret configured for pickup codes')
  return s
}

/** Too many wrong codes for one child inside the window. */
export function isLockedOut(failedAt: string[], now: Date = new Date()): boolean {
  const since = now.getTime() - LOCKOUT_MINUTES * 60 * 1000
  return failedAt.filter(t => new Date(t).getTime() >= since).length >= MAX_FAILED_ATTEMPTS
}
