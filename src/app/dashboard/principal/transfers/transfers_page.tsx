// src/app/dashboard/principal/transfers/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalTransfersClient from './PrincipalTransfersClient'

export default async function PrincipalTransfersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || profile.role !== 'principal') redirect('/login')

  const school   = (profile as any)?.schools ?? null
  const schoolId = school?.id

  // Sent transfers (this school is origin)
  const { data: sent } = await supabase
    .from('student_transfers')
    .select('id, student_id, status, requested_at, approved_at, completed_at, rejection_reason, has_outstanding_fees, outstanding_amount, debt_acknowledged, debt_note, origin_school_id, destination_school_id')
    .eq('origin_school_id', schoolId)
    .order('requested_at', { ascending: false })

  // Received transfers (this school is destination)
  const { data: received } = await supabase
    .from('student_transfers')
    .select('id, student_id, status, requested_at, approved_at, completed_at, rejection_reason, has_outstanding_fees, outstanding_amount, debt_acknowledged, debt_note, origin_school_id, destination_school_id')
    .eq('destination_school_id', schoolId)
    .order('requested_at', { ascending: false })

  // Student profiles involved in any transfer
  const allTransferStudentIds = [
    ...(sent ?? []).map((t: any) => t.student_id),
    ...(received ?? []).map((t: any) => t.student_id),
  ]
  const uniqueStudentIds = [...new Set(allTransferStudentIds)]

  const { data: studentProfiles } = uniqueStudentIds.length > 0
    ? await supabase
        .from('profiles')
        .select('id, full_name, admission_number, class_id')
        .in('id', uniqueStudentIds)
    : { data: [] }

  // Schools involved in transfers
  const allSchoolIds = [
    ...(sent ?? []).map((t: any) => t.destination_school_id),
    ...(received ?? []).map((t: any) => t.origin_school_id),
  ]
  const uniqueSchoolIds = [...new Set(allSchoolIds)].filter(Boolean)

  const { data: schools } = uniqueSchoolIds.length > 0
    ? await supabase
        .from('schools')
        .select('id, name, city')
        .in('id', uniqueSchoolIds)
    : { data: [] }

  // Full student list for Students tab
  const { data: allStudentsRaw } = await supabase
    .from('profiles')
    .select('id, full_name, email, admission_number, class_id, is_active, onboarding_stage, created_at')
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .order('full_name', { ascending: true })

  // Resolve class names
  const classIds = [...new Set((allStudentsRaw ?? []).map((s: any) => s.class_id).filter(Boolean))]
  const { data: classRows } = classIds.length > 0
    ? await supabase.from('classes').select('id, name').in('id', classIds)
    : { data: [] }
  const classMap = new Map((classRows ?? []).map((c: any) => [c.id, c.name]))

  const allStudents = (allStudentsRaw ?? []).map((s: any) => ({
    ...s,
    class_name: classMap.get(s.class_id) ?? null,
  }))

  return (
    <PrincipalTransfersClient
      sent={sent ?? []}
      received={received ?? []}
      studentProfiles={studentProfiles ?? []}
      schools={schools ?? []}
      allStudents={allStudents}
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
}
