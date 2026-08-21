// src/app/api/examination/results/verify/route.ts
// -------------------------------------------------------
// Verify step: approved-by-teacher/principal results get a second pair
// of eyes from the Result Verification Officer (or Examination Officer)
// before publication. Writes ONLY verified/verified_by/verified_at:
// this is the column-level restriction the RLS policy comment in
// lane-c-examination-schema.sql promises: a verifier physically cannot
// also flip `approved` or `published` through this route, even though
// the table-level RLS technically permits it for their appointment.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasExamCapability } from '@/lib/supabase/examPermissions'

export async function POST(req: Request) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  let body: { resultIds?: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't read the request body." }, { status: 400 })
  }

  const resultIds = (body.resultIds ?? []).filter(Boolean)
  if (resultIds.length === 0) {
    return NextResponse.json({ ok: false, error: 'No results selected.' }, { status: 400 })
  }
  if (resultIds.length > 500) {
    return NextResponse.json({ ok: false, error: 'Verify at most 500 results at a time. Split into batches.' }, { status: 400 })
  }

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  const { data: appts } = await admin.from('appointments').select('appointment_type, status').eq('profile_id', user.id).eq('status', 'active')

  if (!hasExamCapability('verify_results', profile?.role, appts as any)) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to verify results.' }, { status: 403 })
  }

  // Only touch rows that (a) belong to this school, (b) are approved,
  // (c) aren't already verified, verifying an already-verified row is a
  // no-op, not an error, so a double-click can't produce a confusing message.
  const { data: eligible } = await admin
    .from('results')
    .select('id')
    .in('id', resultIds)
    .eq('school_id', profile?.school_id)
    .eq('approved', true)
    .eq('verified', false)

  const eligibleIds = (eligible ?? []).map(r => r.id)
  if (eligibleIds.length === 0) {
    return NextResponse.json({ ok: true, verifiedCount: 0, message: 'Nothing to verify. Selected results are either not yet approved or already verified.' })
  }

  const { error: updateError } = await admin
    .from('results')
    .update({ verified: true, verified_by: user.id, verified_at: new Date().toISOString() })
    .in('id', eligibleIds)

  if (updateError) {
    return NextResponse.json({ ok: false, error: `Verification failed, ${updateError.message}. No results were changed.` }, { status: 500 })
  }

  await admin.from('portal_audit_log').insert({
    actor_id: user.id, action: 'results_verified', target_table: 'results',
    metadata: { count: eligibleIds.length, result_ids: eligibleIds, school_id: profile?.school_id },
  }).then(() => {}, () => {}) // best-effort, audit log failure shouldn't block the response, the verification itself already succeeded

  return NextResponse.json({ ok: true, verifiedCount: eligibleIds.length })
}
