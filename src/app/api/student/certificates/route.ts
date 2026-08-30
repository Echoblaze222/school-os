// src/app/api/student/certificates/route.ts
// -------------------------------------------------------
// A student's own view of their certificates. Deliberately separate
// from /api/examination/certificates (the school-admin list, which
// returns every student's certificates and requires manage_exams) -
// this route hard-scopes to `student_id = auth.uid()`, so there's no
// query-param or role-check path that could leak another student's
// certificate here.
//
// Revoked certificates ARE included (not hidden) so a student who
// already downloaded/shared a since-revoked certificate can see that
// for themselves, rather than the school being the only one who knows.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'student') {
    return NextResponse.json({ ok: false, error: 'This view is only available to students.' }, { status: 403 })
  }

  const { data, error } = await admin
    .from('certificates')
    .select('id, certificate_number, status, graduation_year, final_class, issue_date, pdf_url, public_token, revoked_at, revoked_reason, school:schools(name)')
    .eq('student_id', user.id)
    .in('status', ['issued', 'revoked']) // drafts/pending are internal-only, never shown to the student
    .order('issue_date', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: `Could not load your certificates: ${error.message}` }, { status: 500 })

  const verificationBase = process.env.NEXT_PUBLIC_APP_URL || ''
  const certificates = (data ?? []).map(c => ({
    id: c.id, certificateNumber: c.certificate_number, status: c.status,
    graduationYear: c.graduation_year, finalClass: c.final_class, issueDate: c.issue_date,
    pdfUrl: c.pdf_url, revokedAt: c.revoked_at, revokedReason: c.revoked_reason,
    schoolName: (c as any).school?.name ?? null,
    verificationUrl: `${verificationBase.replace(/\/$/, '')}/verify/certificate/${c.public_token}`,
  }))

  return NextResponse.json({ ok: true, certificates })
}
