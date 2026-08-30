// src/app/api/certificates/verify/[token]/route.ts
// -------------------------------------------------------
// Public, unauthenticated (§31/§32). Anyone with the QR/link can call
// this — that's the point — but the response is deliberately minimal:
// verification status, school, student name, certificate type,
// session/year, issue date, certificate number, current status. Never
// phone/address/parent info/grades/internal IDs (§31 "do not expose").
//
// Rate-limited by token so a script can't hammer one guessed token
// looking for a hit, and the authoritative `certificates` row is what's
// queried — never "does a PDF file exist at this path" (§32).
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const admin = createAdminClient()

  if (!token || token.length < 8 || token.length > 64) {
    return NextResponse.json({ ok: true, status: 'not_found' })
  }

  const rl = await checkRateLimit(admin, 'certificate_verify', token, 30, 300)
  if (!rl.allowed) {
    return NextResponse.json({ ok: false, error: 'Too many verification attempts. Try again in a few minutes.' }, { status: 429 })
  }

  const { data: cert } = await admin
    .from('certificates')
    .select('id, certificate_number, status, graduation_year, final_class, issue_date, revoked_at, school:schools(name), student:profiles!certificates_student_id_fkey(full_name)')
    .eq('public_token', token)
    .maybeSingle()

  const result = !cert ? 'not_found' : cert.status === 'revoked' ? 'revoked' : cert.status === 'issued' ? 'valid' : 'not_found'

  // Best-effort verification event log — never blocks the response.
  admin.from('certificate_verification_events').insert({
    certificate_id: cert?.id ?? null, public_token: token, result,
  }).then(() => {}, () => {})

  if (result === 'not_found') {
    return NextResponse.json({ ok: true, status: 'not_found' })
  }

  return NextResponse.json({
    ok: true,
    status: result, // 'valid' | 'revoked'
    certificate: {
      certificateNumber: cert!.certificate_number,
      schoolName: (cert as any).school?.name ?? null,
      studentName: (cert as any).student?.full_name ?? null,
      finalClass: cert!.final_class,
      graduationYear: cert!.graduation_year,
      issueDate: cert!.issue_date,
      revokedAt: cert!.revoked_at,
    },
  })
}
