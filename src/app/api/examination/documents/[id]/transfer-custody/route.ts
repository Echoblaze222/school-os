// src/app/api/examination/documents/[id]/transfer-custody/route.ts
// -------------------------------------------------------
// The ONLY place exam_documents.status / current_custodian_id ever
// change. There is deliberately no client-side UPDATE RLS policy for
// those columns (see lane-c-examination-schema.sql §12), every custody
// move goes through here so exam_document_events always has a complete,
// unforgeable chain: who had it, who it went to, and when. This is
// what makes "who has the live paper right now" always answerable.
//
// Every important action here, no silent failures:
//   idle -> processing -> SUCCESS (event recorded, new status returned)
//                       -> FAILURE (specific reason, document untouched)
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasExamCapability } from '@/lib/supabase/examPermissions'

const VALID_TRANSITIONS: Record<string, string[]> = {
  drafting:     ['submitted'],
  submitted:    ['under_review', 'drafting'],
  under_review: ['approved', 'drafting'],
  approved:     ['printed'],
  printed:      ['distributed'],
  distributed:  ['collected'],
  collected:    ['archived'],
}

const EVENT_TYPE_FOR: Record<string, string> = {
  submitted: 'submitted', under_review: 'reviewed', approved: 'approved',
  printed: 'printed', distributed: 'distributed', collected: 'collected',
  archived: 'archived', drafting: 'returned_to_draft',
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: documentId } = await params
  const supabase = await createClient()
  const admin    = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })
  }

  let body: { toStatus?: string; toProfileId?: string; notes?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't read the request body." }, { status: 400 })
  }

  const { toStatus, toProfileId, notes } = body
  if (!toStatus) {
    return NextResponse.json({ ok: false, error: 'toStatus is required.' }, { status: 400 })
  }

  // Server-side capability check, never trust a hidden button. Uses the
  // admin client to read the caller's own role + appointments so this
  // can't be short-circuited by RLS gaps on either table.
  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  const { data: appts } = await admin.from('appointments').select('appointment_type, status').eq('profile_id', user.id).eq('status', 'active')

  const canReview = hasExamCapability('review_documents', profile?.role, appts as any)
  const canCreate  = hasExamCapability('create_documents', profile?.role, appts as any)
  if (!canReview && !canCreate) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to move this document.' }, { status: 403 })
  }

  const { data: doc } = await admin
    .from('exam_documents')
    .select('id, school_id, status, current_custodian_id, created_by')
    .eq('id', documentId)
    .single()

  if (!doc) {
    return NextResponse.json({ ok: false, error: 'Document not found.' }, { status: 404 })
  }
  if (doc.school_id !== profile?.school_id) {
    return NextResponse.json({ ok: false, error: 'Document not found.' }, { status: 404 }) // don't leak cross-school existence
  }

  // Exam setters (create_documents-only, not review_documents) may only
  // move their own document from drafting -> submitted, every later
  // transition needs review_documents.
  if (!canReview) {
    const isOwnDraftSubmit = doc.created_by === user.id && doc.status === 'drafting' && toStatus === 'submitted'
    if (!isOwnDraftSubmit) {
      return NextResponse.json({ ok: false, error: 'Exam setters can only submit their own drafts for review.' }, { status: 403 })
    }
  }

  const allowedNext = VALID_TRANSITIONS[doc.status] ?? []
  if (!allowedNext.includes(toStatus)) {
    return NextResponse.json({
      ok: false,
      error: `Can't move from "${doc.status}" to "${toStatus}" directly. Valid next steps: ${allowedNext.join(', ') || 'none, this document is at a terminal state'}.`,
    }, { status: 409 })
  }

  const newCustodian = toProfileId ?? user.id

  const { error: updateError } = await admin
    .from('exam_documents')
    .update({ status: toStatus, current_custodian_id: newCustodian, updated_at: new Date().toISOString() })
    .eq('id', documentId)

  if (updateError) {
    return NextResponse.json({ ok: false, error: `Update failed, ${updateError.message}. Document was not changed.` }, { status: 500 })
  }

  const { error: eventError } = await admin.from('exam_document_events').insert({
    document_id: documentId,
    from_profile_id: doc.current_custodian_id,
    to_profile_id: newCustodian,
    event_type: EVENT_TYPE_FOR[toStatus] ?? toStatus,
    notes: notes ?? null,
  })

  if (eventError) {
    // The status DID change even though the audit event failed to write:
    // surface this loudly rather than silently returning success, since a
    // gap in the custody chain is exactly the failure mode this whole
    // design exists to prevent.
    return NextResponse.json({
      ok: false,
      error: 'Status was updated but the custody-chain record failed to save. Contact support before relying on this document\'s history. Do not treat this as a normal retry.',
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, status: toStatus, custodianId: newCustodian })
}
