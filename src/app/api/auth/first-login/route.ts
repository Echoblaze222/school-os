// src/app/api/auth/first-login/route.ts
//
// First-time activation for accounts an admin created (staff, students,
// parents). Sets the user's own password and returns their email so the client
// can sign in straight away.
//
// SECURITY MODEL (audit finding C1)
// The credential accepted here is a single-use, expiring ACTIVATION TOKEN
// issued by an admin (lib/credentials.ts, table activation_credentials).
// It is deliberately NOT profiles.default_code any more: default_code is a
// visible identifier that any signed-in user in a school could read, so using
// it as the secret let one student take over a freshly created principal or
// bursar account. The client still posts the value under the field name
// `code` (the New User tab is unchanged); `token` is accepted as an alias.
//
// Every failure returns the same message so the response reveals nothing about
// which accounts, schools or tokens exist. The token is never logged, echoed,
// or used as a rate-limit key (its hash is).

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import {
  consumeActivationCredential,
  hashActivationToken,
  releaseActivationCredential,
} from '@/lib/credentials'

const INVALID_TOKEN_MESSAGE =
  'Invalid or expired activation code. Check the code and the school you selected, or ask your school administrator for a new activation code.'

function respond(
  body: Record<string, unknown>,
  status: number,
  extraHeaders?: Record<string, string>,
) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', ...extraHeaders },
  })
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null)
    const rawToken    = typeof body?.token === 'string' ? body.token : typeof body?.code === 'string' ? body.code : ''
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : ''
    const schoolId    = typeof body?.schoolId === 'string' && body.schoolId ? body.schoolId : null

    if (!rawToken.trim() || !newPassword) {
      return respond({ error: 'Activation code and new password are required.' }, 400)
    }
    if (newPassword.length < 8) {
      return respond({ error: 'Password must be at least 8 characters.' }, 400)
    }

    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // Throttle on the caller's IP first (one attacker guessing widely), then
    // on the token hash (many requests against one token).
    const ipCheck = await checkRateLimit(adminClient, 'auth_first_login_ip', getClientIp(request), 15, 60)
    if (!ipCheck.allowed) {
      const r = ipCheck.errorResponse!
      return respond({ error: r.error }, r.status, r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined)
    }

    // Anything that is not even shaped like an activation token (for example a
    // legacy default_code) can never match; it still cost an IP attempt above.
    const tokenHash = hashActivationToken(rawToken)
    if (!tokenHash) return respond({ error: INVALID_TOKEN_MESSAGE }, 400)

    const tokenCheck = await checkRateLimit(adminClient, 'auth_first_login_token', tokenHash, 8, 300)
    if (!tokenCheck.allowed) {
      const r = tokenCheck.errorResponse!
      return respond({ error: r.error }, r.status, r.retryAfter ? { 'Retry-After': String(r.retryAfter) } : undefined)
    }

    // Atomic claim: succeeds only for a live, unused, unexpired token that
    // belongs to a not-yet-activated account (and, when the client says which
    // school it selected, to that school). One statement, so two concurrent
    // requests cannot both win.
    const userId = await consumeActivationCredential(adminClient, rawToken, schoolId)
    if (!userId) return respond({ error: INVALID_TOKEN_MESSAGE }, 400)

    const { data: profile, error: profileErr } = await adminClient
      .from('profiles')
      .select('id, email, role, onboarding_stage, school_id, schools ( id, name, primary_color )')
      .eq('id', userId)
      .maybeSingle()

    if (profileErr || !profile) {
      await releaseActivationCredential(adminClient, userId, rawToken)
      return respond({ error: 'Something went wrong. Please try again.' }, 500)
    }

    const { error: updateErr } = await adminClient.auth.admin.updateUserById(userId, { password: newPassword })
    if (updateErr) {
      console.error('First-login password update failed:', updateErr.message)
      // Give the token back so a transient failure does not lock the person out.
      await releaseActivationCredential(adminClient, userId, rawToken)
      if (/password/i.test(updateErr.message)) {
        return respond({ error: 'That password was not accepted. Choose a longer or less common password.' }, 400)
      }
      return respond({ error: 'We could not set your password. Please try again.' }, 500)
    }

    // Password is set: move past the pending-activation stage. Values are the
    // string stages used everywhere else ('stage_2_pending' | ... | 'complete').
    const nextStage = 'stage_2_pending'
    const { error: stageErr } = await adminClient
      .from('profiles')
      .update({ onboarding_stage: nextStage })
      .eq('id', userId)
    if (stageErr) console.error('First-login stage update failed:', stageErr.message)

    const school = (profile as any).schools
    return respond({
      success:          true,
      email:            profile.email,
      onboarding_stage: stageErr ? profile.onboarding_stage : nextStage,
      role:             profile.role,
      school: school ? { id: school.id, name: school.name, primaryColor: school.primary_color } : null,
    }, 200)
  } catch (e: unknown) {
    console.error('First login error:', e instanceof Error ? e.message : 'unknown error')
    return respond({ error: 'Internal server error.' }, 500)
  }
}
