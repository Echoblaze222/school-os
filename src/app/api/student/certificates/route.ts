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
//
// The PDF link returned here is minted fresh on every request and expires
// after an hour (see src/lib/certificates/pdfUrl.ts).
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signCertificatePdfs } from '@/lib/certificates/pdfUrl'

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
    .select('id, school_id, certificate_number, status, graduation_year, final_class, issue_date, pdf_url, public_token, revoked_at, revoked_reason, school:schools(name)')
    .eq('student_id', user.id)
    .in('status', ['issued', 'revoked']) // drafts/pending are internal-only, never shown to the student
    .order('issue_date', { ascending: false })

  if (error) return NextResponse.json({ ok: false, error: `Could not load your certificates: ${error.message}` }, { status: 500 })

  const rows = data ?? []
  const pdfUrls = await signCertificatePdfs(admin, rows.map(c => ({
    schoolId: c.school_id as string,
    certificateNumber: c.certificate_number,
    fallback: c.pdf_url,
  })))

  const verificationBase = process.env.NEXT_PUBLIC_APP_URL || ''
  const certificates = rows.map((c, i) => ({
    id: c.id, certificateNumber: c.certificate_number, status: c.status,
    graduationYear: c.graduation_year, finalClass: c.final_class, issueDate: c.issue_date,
    pdfUrl: pdfUrls[i], revokedAt: c.revoked_at, revokedReason: c.revoked_reason,
    schoolName: (c as any).school?.name ?? null,
    verificationUrl: `${verificationBase.replace(/\/$/, '')}/verify/certificate/${c.public_token}`,
  }))

  return NextResponse.json({ ok: true, certificates })
}
