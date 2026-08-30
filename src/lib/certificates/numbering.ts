// src/lib/certificates/numbering.ts
// -------------------------------------------------------
// Certificate numbering (§30) and integrity hashing (§33).
//
// The actual atomic counter lives in Postgres — next_certificate_number()
// in the migration SQL — because that's the only place concurrent bulk
// issuance from two admin tabs can be made collision-safe (UPSERT ...
// RETURNING under a single row lock). This file only formats the number
// it gets back and computes the tamper-evidence hash. No blockchain, per
// §64 — a centralized authoritative record with a unique number and a
// SHA-256 hash is the whole v1 integrity story.
// -------------------------------------------------------

import { createHash } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/** Calls the DB-side atomic counter and formats e.g. "CERT/2026/000482". */
export async function allocateCertificateNumber(
  admin: SupabaseClient, schoolId: string, year: number, prefix: string,
): Promise<string> {
  const { data, error } = await admin.rpc('next_certificate_number', { p_school_id: schoolId, p_year: year })
  if (error || data === null) throw new Error(`Could not allocate a certificate number: ${error?.message ?? 'unknown error'}`)
  const seq = String(data).padStart(6, '0')
  return `${prefix}/${year}/${seq}`
}

export interface CanonicalCertificateData {
  certificateNumber: string
  schoolId: string
  studentId: string
  graduationYear: number
  finalClass: string | null
  issueDate: string
  schoolName: string
  principalName: string | null
  studentName: string
}

/** SHA-256 over a canonical, key-sorted JSON representation — deterministic regardless of object key order. */
export function computeCertificateHash(data: CanonicalCertificateData): string {
  const canonical = JSON.stringify(data, Object.keys(data).sort())
  return createHash('sha256').update(canonical).digest('hex')
}

/** Cryptographically random, unguessable public verification token — never derived from student ID or certificate number. */
export function generatePublicToken(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}
