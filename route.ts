// src/app/api/staff-codes/regenerate/route.ts
//
// Regenerates a profile's access code (`default_code`). This used to be a
// direct `supabase.from('profiles').update(...)` call from the browser in
// both Principal's and Secretary's CodesClient.tsx, with two problems:
//
//   1. The new code was `Math.floor(1000 + Math.random() * 9000)` - a
//      4-digit number with only 9,000 possibilities. This is the exact
//      weak-randomness issue already fixed once in secretary/create-user
//      (see the comment there): the access code is the sole credential
//      needed to activate an unactivated account, so a short, guessable
//      code lets anyone brute-force their way into hijacking it before the
//      real user's first login.
//   2. The update carried no `school_id` scoping and relied entirely on
//      whatever RLS UPDATE policy exists live on `profiles` (unverified
//      from code alone, per SECURITY_RLS_AUDIT_AND_POLICIES.sql) - the
//      documented `profiles_update_own` policy only allows a user to
//      update their own row, which would make this silently no-op in
//      production, or, if a more permissive live policy exists, would let
//      any authenticated user overwrite anyone's access code.
//
// This route restores the same guarantees create-user already has:
// caller-role verification, same-school ownership check, and a long
// cryptographically random code, written through the service-role client.

import { NextResponse }      from 'next/server'
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateAccessCode, revokeAccessCode } from '@/lib/supabase/access-code-generator'

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
      .from('profiles').select('id, role, school_id, full_name').eq('id', profileId).single()

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

    return NextResponse.json({ code })
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? 'Internal error' }, { status: 500 })
  }
}
