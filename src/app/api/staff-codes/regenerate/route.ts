// src/app/api/staff-codes/regenerate/route.ts
//
// Re-issues a person's code from the Codes screen. What "regenerate" means now
// depends on whether the account has been activated yet (audit finding C1):
//
//   * NOT yet activated (stage 'start' / 'stage_1_pending')
//       -> issues a fresh ACTIVATION token (single-use, expiring, hash-only in
//          the database, any previous token superseded) and returns it as
//          `code`, exactly once. profiles.default_code is left untouched: it
//          is only a visible identifier and is not what activates the account.
//   * already activated
//       -> unchanged behaviour: rotates default_code (the visible identifier
//          used with code-signin) and returns it as `code`.
//
// History kept from the original header: this used to be a direct browser
// `profiles.update(...)`, then a 4-digit Math.random code. It is now a
// caller-verified, same-school, service-role write with cryptographic
// randomness.

import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAccessCode, revokeAccessCode } from '@/lib/supabase/access-code-generator'
import { issueActivationCredential } from '@/lib/credentials'

export async function POST(request: Request) {
  try {
    const { profileId } = await request.json()
    if (!profileId) {
      return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const admin = createAdminClient()

    const { data: caller } = await admin
      .from('profiles').select('role, school_id').eq('id', user.id).single()

    const callerRole = caller?.role as string | undefined
    if (!caller || !['principal', 'secretary', 'admin'].includes(callerRole ?? '')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: target } = await admin
      .from('profiles').select('id, role, school_id, full_name, onboarding_stage').eq('id', profileId).single()

    if (!target || target.school_id !== caller.school_id) {
      // Same error either way - don't reveal whether the id exists in
      // another school.
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    // A secretary may only regenerate codes for the same roles they're
    // allowed to create (student/parent). Principal/admin can regenerate
    // any non-principal/admin staff or student code. Nobody regenerates a
    // principal/admin code through this same-permission screen.
    const ALLOWED_TARGET_ROLES: Record<string, string[]> = {
      secretary: ['student', 'parent'],
      principal: ['student', 'teacher', 'bursar', 'secretary', 'librarian', 'nurse', 'parent'],
      admin:     ['student', 'teacher', 'bursar', 'secretary', 'librarian', 'nurse', 'parent'],
    }
    if (!(ALLOWED_TARGET_ROLES[callerRole ?? ''] ?? []).includes(target.role)) {
      return NextResponse.json({ error: 'Not permitted to regenerate this code' }, { status: 403 })
    }

    // ── Not activated yet: issue a new activation token ─────────────────────
    const stage = (target as any).onboarding_stage as string | null
    if (stage === 'start' || stage === 'stage_1_pending') {
      let activation: { token: string; expiresAt: string }
      try {
        activation = await issueActivationCredential(admin, { userId: profileId, createdBy: user.id })
      } catch (actErr: any) {
        console.error('Activation credential issue failed:', actErr?.message)
        return NextResponse.json({ error: 'Could not issue a new activation code. Please try again.' }, { status: 500 })
      }

      try {
        // NEVER put the token in the audit log.
        await admin.from('portal_audit_log').insert({
          action:       'activation_credential_issued',
          actor_id:     user.id,
          target_table: 'profiles',
          target_id:    profileId,
          metadata:     { role: target.role, school_id: caller.school_id },
          logged_at:    new Date().toISOString(),
        })
      } catch { /* non-critical */ }

      return NextResponse.json({ code: activation.token, kind: 'activation', expiresAt: activation.expiresAt })
    }

    // ── Already activated: rotate the visible identifier (unchanged behaviour) ─
    // Revoke whatever access_codes row is currently active for this
    // profile before issuing a new one, so a regenerated code can never
    // leave the old one still usable. Best-effort: a target with no prior
    // access_codes row (accounts created before this table existed) simply
    // has nothing to revoke, which is fine, not an error.
    const { data: priorCodes } = await admin
      .from('access_codes')
      .select('code')
      .eq('profile_id', profileId)
      .in('status', ['unused', 'active'])

    for (const prior of priorCodes ?? []) {
      try {
        await revokeAccessCode(admin, { code: prior.code, revokedBy: user.id })
      } catch { /* non-critical, new code below is still issued either way */ }
    }

    let code: string
    try {
      const generated = await generateAccessCode(admin, {
        schoolId:    caller.school_id,
        fullName:    (target as any).full_name ?? target.role,
        profileId,
        generatedBy: user.id,
      })
      code = generated.code
    } catch (codeErr: any) {
      return NextResponse.json({ error: `Access code generation failed: ${codeErr.message}` }, { status: 500 })
    }

    const { error: updateError } = await admin
      .from('profiles')
      .update({ default_code: code })
      .eq('id', profileId)
      .eq('school_id', caller.school_id)

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    try {
      await admin.from('portal_audit_log').insert({
        action:       'access_code_regenerated',
        actor_id:     user.id,
        target_table: 'profiles',
        target_id:    profileId,
        metadata:     { role: target.role, school_id: caller.school_id },
        logged_at:    new Date().toISOString(),
      })
    } catch { /* non-critical */ }

    return NextResponse.json({ code, kind: 'identifier' })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
