// src/app/api/examination/certificates/[id]/revoke/route.ts
// -------------------------------------------------------
// §39: revocation, not deletion. The row stays forever with status
// REVOKED so the public verification page keeps answering questions
// about it honestly ("this certificate was revoked on <date>") instead
// of returning NOT_FOUND for something that really was issued once.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: certificateId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  if (profile?.role !== 'principal') {
    return NextResponse.json({ ok: false, error: 'Only the principal can revoke certificates.' }, { status: 403 })
  }

  let body: { reason?: string }
  try { body = await req.json() } catch { body = {} }
  const reason = (body.reason ?? '').trim()
  if (!reason) return NextResponse.json({ ok: false, error: 'A reason is required to revoke a certificate.' }, { status: 400 })

  const { data: cert } = await admin.from('certificates').select('id, status, school_id').eq('id', certificateId).eq('school_id', profile.school_id).maybeSingle()
  if (!cert) return NextResponse.json({ ok: false, error: 'Certificate not found.' }, { status: 404 })
  if (cert.status !== 'issued') {
    return NextResponse.json({ ok: false, error: `Only an issued certificate can be revoked (current status: ${cert.status}).` }, { status: 409 })
  }

  const { error } = await admin.from('certificates').update({
    status: 'revoked', revoked_at: new Date().toISOString(), revoked_by: user.id, revoked_reason: reason,
    updated_at: new Date().toISOString(),
  }).eq('id', cert.id)

  if (error) return NextResponse.json({ ok: false, error: `Revocation failed: ${error.message}` }, { status: 500 })

  await admin.from('certificate_audit_events').insert({
    certificate_id: cert.id, event_type: 'revoked', actor_id: user.id, metadata: { reason },
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true })
}
