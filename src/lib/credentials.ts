// src/lib/credentials.ts
//
// Server-only helpers for the two separate secrets that replaced the old
// habit of using profiles.default_code as a password:
//
//   1. ACTIVATION token  - lets a brand-new user set their first password.
//   2. STUDENT LINK code - lets a parent link their account to a child.
//
// default_code stays what it always visibly was: a NON-secret identifier used
// for display and for the code-signin login screen. It is never accepted as
// either credential above.
//
// Only a SHA-256 hash of a token/code ever reaches the database. The
// plaintext exists in memory long enough to be returned to the person who
// issued it (once) and is never logged, audited or stored. Both are 80-100
// bits of CSPRNG output, so a fast hash is appropriate (there is nothing to
// brute-force offline) and domain separation stops one kind of secret being
// replayed as the other.

import crypto from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

// Crockford base32 minus I, L, O, U. 256 % 32 === 0, so `byte & 31` is unbiased.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

export const ACTIVATION_TTL_HOURS = 168 // 7 days
export const LINK_CODE_TTL_DAYS   = 30

function randomChars(n: number): string {
  const bytes = crypto.randomBytes(n)
  let out = ''
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] & 31]
  return out
}

function group(s: string, size: number): string[] {
  const parts: string[] = []
  for (let i = 0; i < s.length; i += size) parts.push(s.slice(i, i + size))
  return parts
}

/** ACT-XXXXX-XXXXX-XXXXX-XXXXX  (100 bits) */
export function generateActivationToken(): string {
  return `ACT-${group(randomChars(20), 5).join('-')}`
}

/** LNK-XXXX-XXXX-XXXX-XXXX  (80 bits) */
export function generateLinkCode(): string {
  return `LNK-${group(randomChars(16), 4).join('-')}`
}

// Uppercase, drop separators/whitespace, and apply the Crockford look-alike
// mapping so a person reading a code aloud or typing it on a phone is not
// punished for O/0 or I/L/1 confusion. None of those letters are in ALPHABET,
// so this can never make two different codes collide. The prefix is optional
// (people drop it), and is only stripped when the length proves it is there,
// because a body may legitimately start with the same letters as the prefix.
function normalize(raw: string, prefix: string, bodyLength: number): string | null {
  if (typeof raw !== 'string') return null
  let s = raw.toUpperCase().replace(/[^A-Z0-9]/g, '')
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1')
  if (s.length === prefix.length + bodyLength && s.startsWith(prefix)) s = s.slice(prefix.length)
  if (s.length !== bodyLength) return null
  for (const ch of s) if (!ALPHABET.includes(ch)) return null
  return s
}

export function normalizeActivationToken(raw: string): string | null {
  return normalize(raw, 'ACT', 20)
}

export function normalizeLinkCode(raw: string): string | null {
  return normalize(raw, 'LNK', 16)
}

function sha256(domain: string, value: string): string {
  return crypto.createHash('sha256').update(`${domain}:v1:${value}`).digest('hex')
}

/** Hash of a normalized token, or null when the input is not even shaped like a token. */
export function hashActivationToken(raw: string): string | null {
  const n = normalizeActivationToken(raw)
  return n ? sha256('activation', n) : null
}

export function hashLinkCode(raw: string): string | null {
  const n = normalizeLinkCode(raw)
  return n ? sha256('link', n) : null
}

// ---------------------------------------------------------------------------
// Activation credentials
// ---------------------------------------------------------------------------

/**
 * Issues a fresh activation token for an un-activated account and returns the
 * plaintext ONCE. Any previously live token for that account is superseded.
 * Throws (without ever including the token in the message) on failure.
 */
export async function issueActivationCredential(
  admin: SupabaseClient,
  params: { userId: string; createdBy: string | null; ttlHours?: number },
): Promise<{ token: string; expiresAt: string }> {
  const token = generateActivationToken()
  const tokenHash = hashActivationToken(token)!
  const { data, error } = await admin.rpc('issue_activation_credential', {
    p_user_id:    params.userId,
    p_token_hash: tokenHash,
    p_created_by: params.createdBy,
    p_ttl_hours:  params.ttlHours ?? ACTIVATION_TTL_HOURS,
  })
  if (error || !data) {
    throw new Error(`Activation credential could not be issued: ${error?.message ?? 'no result'}`)
  }
  return { token, expiresAt: data as string }
}

/** Claims a token. Returns the profile id, or null for every kind of failure. */
export async function consumeActivationCredential(
  admin: SupabaseClient,
  rawToken: string,
  schoolId: string | null,
): Promise<string | null> {
  const tokenHash = hashActivationToken(rawToken)
  if (!tokenHash) return null
  const { data, error } = await admin.rpc('consume_activation_credential', {
    p_token_hash: tokenHash,
    p_school_id:  schoolId,
  })
  if (error) throw new Error(`Activation credential check failed: ${error.message}`)
  return (data as string | null) ?? null
}

export async function releaseActivationCredential(
  admin: SupabaseClient,
  userId: string,
  rawToken: string,
): Promise<void> {
  const tokenHash = hashActivationToken(rawToken)
  if (!tokenHash) return
  await admin.rpc('release_activation_credential', { p_user_id: userId, p_token_hash: tokenHash })
}

// ---------------------------------------------------------------------------
// Student link codes
// ---------------------------------------------------------------------------

export async function issueStudentLinkCode(
  admin: SupabaseClient,
  params: { studentId: string; createdBy: string | null; ttlDays?: number },
): Promise<{ code: string; expiresAt: string }> {
  const code = generateLinkCode()
  const { data, error } = await admin.rpc('issue_student_link_code', {
    p_student_id: params.studentId,
    p_code_hash:  hashLinkCode(code)!,
    p_created_by: params.createdBy,
    p_ttl_days:   params.ttlDays ?? LINK_CODE_TTL_DAYS,
  })
  if (error || !data) throw new Error(`Link code could not be issued: ${error?.message ?? 'no result'}`)
  return { code, expiresAt: data as string }
}

/** Which student (in this school) does this code point at? null when invalid/expired. */
export async function resolveStudentLinkCode(
  admin: SupabaseClient,
  rawCode: string,
  schoolId: string,
): Promise<string | null> {
  const codeHash = hashLinkCode(rawCode)
  if (!codeHash) return null
  const { data, error } = await admin.rpc('resolve_student_link_code', { p_code_hash: codeHash, p_school_id: schoolId })
  if (error) throw new Error(`Link code check failed: ${error.message}`)
  return (data as string | null) ?? null
}

/** Links the parent to the student behind the code. null when the code is invalid for this parent. */
export async function linkParentByCode(
  admin: SupabaseClient,
  parentId: string,
  rawCode: string,
): Promise<string | null> {
  const codeHash = hashLinkCode(rawCode)
  if (!codeHash) return null
  const { data, error } = await admin.rpc('link_parent_by_code', { p_parent_id: parentId, p_code_hash: codeHash })
  if (error) throw new Error(`Link failed: ${error.message}`)
  return (data as string | null) ?? null
}
