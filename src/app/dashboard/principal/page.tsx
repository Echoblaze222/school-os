// src/app/dashboard/principal/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalDashboardClient from './PrincipalDashboardClient'

function getCurrentTermAndYear() {
  const now   = new Date()
  const month = now.getMonth()
  const year  = now.getFullYear()

  let term: string
  let academicYear: string

  if (month >= 8) {
    term         = 'First Term'
    academicYear = `${year}/${year + 1}`
  } else if (month <= 2) {
    term         = 'Second Term'
    academicYear = `${year - 1}/${year}`
  } else {
    term         = 'Third Term'
    academicYear = `${year - 1}/${year}`
  }

  return { term, academicYear }
}

export default async function PrincipalDashboardPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', session.user.id).single()

  const school   = (profile as any)?.schools ?? null
  const schoolId = school?.id
  const { term, academicYear } = getCurrentTermAndYear()

  // Student count
  const { count: studentCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('role', 'student')

  // Teacher count
  const { count: teacherCount } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('role', 'teacher')

  // Class count
  const { count: classCount } = await supabase
    .from('classes')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('is_active', true)

  // ── Average Score ──
  const { data: results } = await supabase
    .from('results')
    .select('score, max_score')
    .eq('school_id', schoolId)
    .eq('term', term)
    .eq('academic_year', academicYear)
    .eq('approved', true)

  const resultList = results ?? []
  const avgScore = resultList.length > 0
    ? Math.round(
        resultList.reduce((sum, r) => {
          const pct = ((r as any).max_score > 0)
            ? (((r as any).score ?? 0) / (r as any).max_score) * 100
            : 0
          return sum + pct
        }, 0) / resultList.length
      )
    : 0

  // ── Attendance Rate (last 30 days) ──
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const sinceDate = thirtyDaysAgo.toISOString().split('T')[0]

  const { data: attendanceRecords } = await supabase
    .from('attendance')
    .select('is_present')
    .eq('school_id', schoolId)
    .gte('date', sinceDate)

  const attendanceList = attendanceRecords ?? []
  const attendanceRate = attendanceList.length > 0
    ? Math.round(
        (attendanceList.filter((a: any) => a.is_present).length / attendanceList.length) * 100
      )
    : 0

  // ── Fee Collection Rate ──
  const { data: payments } = await supabase
    .from('payments')
    .select('amount_paid_ngn')
    .eq('school_id', schoolId)

  const { data: feeStructures } = await supabase
    .from('fee_structures')
    .select('amount_ngn')
    .eq('school_id', schoolId)
    .eq('term', term)
    .eq('academic_year', academicYear)

  const payList = payments ?? []
  const feeList = feeStructures ?? []

  const totalCollected = payList.reduce((s, p) => s + ((p as any).amount_paid_ngn ?? 0), 0)
  const feePerStudent  = feeList.reduce((s, f) => s + ((f as any).amount_ngn ?? 0), 0)
  const totalExpected  = feePerStudent * (studentCount ?? 0)

  const collectionRate = totalExpected > 0
    ? Math.round((totalCollected / totalExpected) * 100)
    : 0

  // ── School Health Score (average of the three, capped at 100) ──
  const healthScore = Math.min(
    100,
    Math.round((avgScore + attendanceRate + collectionRate) / 3)
  )

  // ── Pending actions: unapproved results ──
  const { count: pendingResultsCount } = await supabase
    .from('results')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', schoolId)
    .eq('term', term)
    .eq('academic_year', academicYear)
    .eq('approved', false)

  const pendingActions = pendingResultsCount ?? 0

  return (
    <PrincipalDashboardClient
      profile={profile}
      school={school}
      userId={session.user.id}
      counts={{
        studentCount: studentCount ?? 0,
        teacherCount: teacherCount ?? 0,
        classCount:   classCount ?? 0,
        avgScore,
        attendanceRate,
        collectionRate,
        healthScore,
        pendingActions,
      }}
    />
  )
}
