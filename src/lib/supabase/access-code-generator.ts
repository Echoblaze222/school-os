// lib/supabase/access-code-generator.ts
//
// Generates access codes in the XXX-YYYY-NNNN format the security spec
// defines (example: SIM-2026-0010), using the atomic per-school-per-year
// sequence in access-code-sequence-and-lifecycle.sql instead of the
// crypto-random-suffix format the four call sites below previously used.
//
// This replaces the "COUNT(*)+1 risk avoided by going random instead"
// approach with the sequence the spec actually asked for, while keeping the
// same never-guessable property: the sequence number alone (0001-9999) is
// not the credential, the full code plus normal rate limiting on
// code-signin is. Callers still pass an admin client, same as every other
// access-code call site in this codebase.
//
// Every existing call site (secretary/create-user, admin/create-user,
// principal/enrol-with-role, staff-codes/regenerate) still generates codes
// the old way as of this file being added. They need to be switched to call
// generateAccessCode() below and to insert the resulting row into
// access_codes; that switch has not been made yet.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface GeneratedAccessCode {
  code: string
  sequenceYear: number
  sequenceValue: number
}

// fullName's first three alphabetic characters, uppercase, per the spec.
// Falls back to 'XXX' if fewer than three alphabetic characters are present
// (spec does not cover this case; documented here rather than silently
// producing a shorter or differently-shaped prefix).
function namePrefix(fullName: string): string {
  const letters = fullName.replace(/[^a-zA-Z]/g, '').toUpperCase()
  if (letters.length < 3) return (letters + 'XXX').slice(0, 3)
  return letters.slice(0, 3)
}

export async function generateAccessCode(
  admin: SupabaseClient,
  params: { schoolId: string; fullName: string; profileId: string; generatedBy: string | null },
): Promise<GeneratedAccessCode> {
  const year = new Date().getFullYear()

  const { data: seqValue, error: seqErr } = await admin
    .rpc('next_access_code_sequence', { p_school_id: params.schoolId, p_year: year })

  if (seqErr || seqValue == null) {
    throw new Error(`Access code sequence error: ${seqErr?.message ?? 'no value returned'}`)
  }

  if (seqValue > 9999) {
    // Spec defines NNNN as exactly four digits. This school/year has
    // exhausted the range; surfacing this as an error rather than silently
    // producing a 5-digit code that breaks the documented format, or
    // silently wrapping back to 0001 and risking a collision.
    throw new Error(
      `Access code sequence for school ${params.schoolId} / ${year} exceeded 9999. This needs a product decision (new prefix segment, or reset policy), not a silent format change.`,
    )
  }

  const code = `${namePrefix(params.fullName)}-${year}-${String(seqValue).padStart(4, '0')}`

  const { error: insertErr } = await admin.from('access_codes').insert({
    school_id: params.schoolId,
    profile_id: params.profileId,
    code,
    sequence_year: year,
    sequence_value: seqValue,
    status: 'unused',
    generated_by: params.generatedBy,
  })

  if (insertErr) {
    throw new Error(`Failed to record access code lifecycle row: ${insertErr.message}`)
  }

  return { code, sequenceYear: year, sequenceValue: seqValue }
}

// Marks a profile's current access code row revoked. Does not touch
// profiles.default_code - the caller is still responsible for clearing or
// replacing that column, same as it always has been, since first-login /
// code-signin read default_code directly and do not consult access_codes
// yet (see the "STILL OUTSTANDING" note in the migration file).
export async function revokeAccessCode(
  admin: SupabaseClient,
  params: { code: string; revokedBy: string },
): Promise<void> {
  const { error } = await admin
    .from('access_codes')
    .update({ status: 'revoked', revoked_by: params.revokedBy, revoked_at: new Date().toISOString() })
    .eq('code', params.code)

  if (error) {
    throw new Error(`Failed to revoke access code: ${error.message}`)
  }
}
