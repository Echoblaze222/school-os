// src/app/api/examination/results/publish/route.ts
// -------------------------------------------------------
// Publish step: the moment a result becomes visible to the student and
// parent (see the `published` filter added to student/parent results
// pages, search STUDENT_PARENT_VISIBILITY_NOTE in the Lane C report for
// the exact files touched). Restricted to Examination Officer +
// Principal per the §25 permission matrix.
//
// Bulk publication is exactly the kind of "examination traffic spike"
// the spec calls out, a whole class's results often get published in
// one action, at which point every parent app in that class polls at
// once. This route can't fix client-side polling patterns it doesn't
// own, but it does: (a) batch-limit the write itself so one request
// can't touch an unbounded set of rows, (b) reuse the existing rate
// limiter so the endpoint itself can't be hammered.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasExamCapability } from '@/lib/supabase/examPermissions'
import { checkRateLimit } from '@/lib/rateLimit'

export async function POST(req: Request) {
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const rateCheck = await checkRateLimit(admin, 'exam_results_publish', user.id, 20, 3600)
  if (!rateCheck.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many publish actions in a short time. Wait a few minutes and try again.' }, { status: 429 })
  }

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
    return NextResponse.json({ ok: false, error: 'Publish at most 500 results at a time. Split into batches so one release does not spike load for every parent at once.' }, { status: 400 })
  }

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  const { data: appts } = await admin.from('appointments').select('appointment_type, status').eq('profile_id', user.id).eq('status', 'active')

  if (!hasExamCapability('publish_results', profile?.role, appts as any)) {
    return NextResponse.json({ ok: false, error: 'Publishing results is restricted to the Examination Officer and the Principal.' }, { status: 403 })
  }

  const { data: eligible } = await admin
    .from('results')
    .select('id')
    .in('id', resultIds)
    .eq('school_id', profile?.school_id)
    .eq('approved', true)
    .eq('verified', true)
    .eq('published', false)

  const eligibleIds = (eligible ?? []).map(r => r.id)
  if (eligibleIds.length === 0) {
    return NextResponse.json({ ok: true, publishedCount: 0, message: 'Nothing to publish. Selected results still need approval and/or verification first, or are already published.' })
  }

  const { error: updateError } = await admin
    .from('results')
    .update({ published: true, published_by: user.id, published_at: new Date().toISOString() })
    .in('id', eligibleIds)

  if (updateError) {
    return NextResponse.json({ ok: false, error: `Publish failed, ${updateError.message}. No results were released.` }, { status: 500 })
  }

  await admin.from('portal_audit_log').insert({
    actor_id: user.id, action: 'results_published', target_table: 'results',
    metadata: { count: eligibleIds.length, result_ids: eligibleIds, school_id: profile?.school_id },
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true, publishedCount: eligibleIds.length })
}
