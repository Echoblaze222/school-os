// src/app/dashboard/principal/report-cards/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalReportCardsClient from './PrincipalReportCardsClient'

export default async function PrincipalReportCardsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || profile.role !== 'principal') redirect('/login')

  const school = (profile as any).schools ?? null

  const { data: reportCards } = await supabase
    .from('report_cards')
    .select(`
      id, term, academic_year, class_teacher_remark, principal_remark, status,
      attendance_start_date, attendance_end_date,
      student:profiles!report_cards_student_id_fkey ( full_name, admission_number ),
      classes ( name, class_level )
    `)
    .eq('school_id', school?.id)
    .order('created_at', { ascending: false })

  return (
    <PrincipalReportCardsClient
      profile={profile}
      school={school}
      principalId={user.id}
      hasSignature={!!profile.signature_url}
      reportCards={reportCards ?? []}
    />
  )
}
