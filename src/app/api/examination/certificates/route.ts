// src/app/api/examination/certificates/route.ts
// -------------------------------------------------------
// Lists certificates for the school's certificate management UI (§38).
// Read-only; issuance/revocation stay in their own dedicated routes so
// there's exactly one code path that ever changes a certificate's status.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasExamCapability } from '@/lib/supabase/examPermissions'

export async function GET(req: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  const { data: appts } = await admin.from('appointments').select('appointment_type, status').eq('profile_id', user.id).eq('status', 'active')
  if (!hasExamCapability('manage_exams', profile?.role, appts as any)) {
    return NextResponse.json({ ok: false, error: 'You do not have permission to view certificates.' }, { status: 403 })
  }
  if (!profile?.school_id) return NextResponse.json({ ok: false, error: 'No school linked to this account.' }, { status: 400 })

  const url = new URL(req.url)
  const status = url.searchParams.get('status')
  const graduationYear = url.searchParams.get('graduationYear')

  let query = admin
    .from('certificates')
    .select('id, certificate_number, status, graduation_year, final_class, issue_date, pdf_url, public_token, revoked_at, revoked_reason, created_at, student:profiles!certificates_student_id_fkey(id, full_name, avatar_url)')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (status) query = query.eq('status', status)
  if (graduationYear) query = query.eq('graduation_year', Number(graduationYear))

  const { data, error } = await query
  if (error) return NextResponse.json({ ok: false, error: `Could not load certificates: ${error.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, certificates: data ?? [] })
}
