// src/app/dashboard/secretary/transfers/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import TransfersClient from './TransfersClient'

export default async function TransfersPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // FIX: join schools(*) inline — same pattern as principal/page.tsx
  // Old code queried school_branding which is a different table entirely
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  const school   = (profile as any).schools ?? null
  const schoolId = profile.school_id

  // FIX: removed from_class, to_class — those columns don't exist in student_transfers
  const [sentRes, receivedRes] = await Promise.all([
    supabase
      .from('student_transfers')
      .select(`
        id, student_id, status, requested_at, approved_at, completed_at,
        rejection_reason, has_outstanding_fees, outstanding_amount,
        debt_acknowledged, debt_note, origin_school_id, destination_school_id
      `)
      .eq('origin_school_id', schoolId)
      .order('requested_at', { ascending: false }),

    supabase
      .from('student_transfers')
      .select(`
        id, student_id, status, requested_at, approved_at, completed_at,
        rejection_reason, has_outstanding_fees, outstanding_amount,
        debt_acknowledged, debt_note, origin_school_id, destination_school_id
      `)
      .eq('destination_school_id', schoolId)
      .order('requested_at', { ascending: false }),
  ])

  const sent     = sentRes.data     ?? []
  const received = receivedRes.data ?? []

  // Resolve student names for transfers that exist
  const transferStudentIds = [...new Set([...sent, ...received].map((t: any) => t.student_id))]
  const { data: transferStudents } = transferStudentIds.length
    ? await supabase.from('profiles').select('id, full_name, admission_number, class_id').in('id', transferStudentIds)
    : { data: [] }

  // Resolve other school names
  const otherSchoolIds = [...new Set([
    ...sent.map((t: any) => t.destination_school_id),
    ...received.map((t: any) => t.origin_school_id),
  ])]
  const { data: otherSchools } = otherSchoolIds.length
    ? await supabase.from('schools').select('id, name, city').in('id', otherSchoolIds)
    : { data: [] }

  // NEW: load all students in this school so they display in the student list tab
  const { data: allStudents } = await supabase
    .from('profiles')
    .select('id, full_name, email, admission_number, class_id, onboarding_stage, is_active, created_at')
    .eq('school_id', schoolId)
    .eq('role', 'student')
    .order('full_name')

  // Resolve class names for all students
  const classIds = [...new Set((allStudents ?? []).map((s: any) => s.class_id).filter(Boolean))]
  const { data: classes } = classIds.length
    ? await supabase.from('classes').select('id, name').in('id', classIds)
    : { data: [] }

  const classMap: Record<string, string> = {}
  ;(classes ?? []).forEach((c: any) => { classMap[c.id] = c.name })

  const studentsWithClass = (allStudents ?? []).map((s: any) => ({
    ...s,
    class_name: s.class_id ? classMap[s.class_id] : null,
  }))

  return (
    <TransfersClient
      sent={sent}
      received={received}
      studentProfiles={transferStudents ?? []}
      schools={otherSchools ?? []}
      allStudents={studentsWithClass}
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
         }
