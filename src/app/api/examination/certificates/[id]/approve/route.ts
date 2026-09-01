// src/app/api/examination/certificates/[id]/approve/route.ts
// -------------------------------------------------------
// The ONLY place a certificate moves DRAFT/PENDING_APPROVAL -> ISSUED.
// This is where everything that must never change later gets frozen:
//   - certificate number (allocated here, atomically, never re-used)
//   - the `snapshot` (school name/logo/principal/signature/stamp AS OF
//     TODAY — later branding changes never alter this certificate)
//   - the certificate_hash (tamper-evidence over the snapshot)
//   - the QR code (points at the public verification token)
//   - the rendered PDF, uploaded once and never regenerated in place
//
// Principal-only, matching the trust level of every other "issue an
// official document" action in this app (report cards, results
// publish). Idempotent: calling approve twice on an already-issued
// certificate is a no-op, not a duplicate issuance.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { allocateCertificateNumber, computeCertificateHash } from '@/lib/certificates/numbering'
import { CertificateDocument, type CertificateSnapshot } from '@/lib/certificates/pdf'
import { renderToBuffer } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import React from 'react'

export const maxDuration = 30

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: certificateId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  if (profile?.role !== 'principal') {
    return NextResponse.json({ ok: false, error: 'Only the principal can issue certificates.' }, { status: 403 })
  }

  const rl = await checkRateLimit(admin, 'certificate_approve', user.id, 200, 3600)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })

  const { data: cert } = await admin.from('certificates').select('*').eq('id', certificateId).eq('school_id', profile.school_id).maybeSingle()
  if (!cert) return NextResponse.json({ ok: false, error: 'Certificate not found.' }, { status: 404 })

  if (cert.status === 'issued') {
    return NextResponse.json({ ok: true, alreadyIssued: true, certificate: { id: cert.id, certificateNumber: cert.certificate_number, pdfUrl: cert.pdf_url } })
  }
  if (cert.status === 'revoked') {
    return NextResponse.json({ ok: false, error: 'This certificate was revoked and cannot be issued. Create a new one instead.' }, { status: 409 })
  }

  const [{ data: student }, { data: school }, { data: settings }] = await Promise.all([
    admin.from('profiles').select('full_name').eq('id', cert.student_id).single(),
    admin.from('schools').select('name, tagline, logo_url, primary_color').eq('id', cert.school_id).single(),
    admin.from('certificate_settings').select('*').eq('school_id', cert.school_id).maybeSingle(),
  ])

  if (!student) return NextResponse.json({ ok: false, error: 'Student record not found.' }, { status: 404 })

  const principalName = settings?.principal_name || 'Principal'
  const principalTitle = settings?.principal_title || 'Principal'
  const prefix = settings?.certificate_prefix || 'CERT'
  const verificationBase = settings?.verification_base_url || process.env.NEXT_PUBLIC_APP_URL || ''

  let certificateNumber: string
  try {
    certificateNumber = await allocateCertificateNumber(admin, cert.school_id, cert.graduation_year, prefix)
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }

  const issueDate = new Date()
  const issueDateLabel = issueDate.toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
  const verificationUrl = `${verificationBase.replace(/\/$/, '')}/verify/certificate/${cert.public_token}`

  const certificateHash = computeCertificateHash({
    certificateNumber, schoolId: cert.school_id, studentId: cert.student_id,
    graduationYear: cert.graduation_year, finalClass: cert.final_class,
    issueDate: issueDate.toISOString(), schoolName: school?.name ?? 'School',
    principalName, studentName: student.full_name,
  })

  let qrDataUrl: string
  try {
    qrDataUrl = await QRCode.toDataURL(verificationUrl, { margin: 1, width: 240 })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `QR generation failed: ${err.message}` }, { status: 500 })
  }

  const snapshot: CertificateSnapshot = {
    schoolName: school?.name ?? 'School',
    schoolMotto: school?.tagline ?? null,
    logoUrl: school?.logo_url ?? null,
    studentName: student.full_name,
    finalClass: cert.final_class ?? '',
    graduationYear: cert.graduation_year,
    certificateNumber,
    issueDateLabel,
    principalName,
    principalTitle,
    signatureUrl: settings?.signature_url ?? null,
    stampUrl: settings?.stamp_url ?? null,
    qrDataUrl,
    verificationUrl,
  }

  let pdfBuffer: Buffer
  try {
    // @react-pdf/renderer's renderToBuffer types the parameter as
    // ReactElement<DocumentProps> - i.e. literally a <Document> element,
    // not a component that renders one. CertificateDocument's root IS a
    // <Document> at runtime, but its own element type doesn't structurally
    // match DocumentProps, so TS rejects it even though this is the
    // library's documented usage pattern. Cast at the boundary.
    pdfBuffer = await renderToBuffer(
      React.createElement(CertificateDocument, { data: snapshot, primary: school?.primary_color ?? '#800020' }) as React.ReactElement<any>,
    )
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: `PDF generation failed: ${err.message}` }, { status: 500 })
  }

  const fileName = `certificates/${cert.school_id}/${certificateNumber.replace(/\//g, '-')}.pdf`
  const { error: uploadErr } = await admin.storage.from('pdf-exports').upload(fileName, pdfBuffer, { upsert: true, contentType: 'application/pdf' })
  if (uploadErr) return NextResponse.json({ ok: false, error: `Storage upload failed: ${uploadErr.message}` }, { status: 500 })

  const { data: signed } = await admin.storage.from('pdf-exports').createSignedUrl(fileName, 60 * 60 * 24 * 365)
  const pdfUrl = signed?.signedUrl ?? fileName

  const { error: updateErr } = await admin.from('certificates').update({
    status: 'issued', certificate_number: certificateNumber, certificate_hash: certificateHash,
    snapshot: snapshot as any, pdf_url: pdfUrl, issue_date: issueDate.toISOString().slice(0, 10),
    issued_by: user.id, approved_by: user.id, updated_at: new Date().toISOString(),
  }).eq('id', cert.id)

  if (updateErr) return NextResponse.json({ ok: false, error: `Could not finalize issuance: ${updateErr.message}` }, { status: 500 })

  await admin.from('certificate_audit_events').insert({
    certificate_id: cert.id, event_type: 'issued', actor_id: user.id,
    metadata: { certificate_number: certificateNumber },
  }).then(() => {}, () => {})

  return NextResponse.json({ ok: true, certificate: { id: cert.id, certificateNumber, pdfUrl, verificationUrl } })
}
