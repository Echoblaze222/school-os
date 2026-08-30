// src/app/dashboard/principal/certificates/page.tsx
// Mirrors the alumni page's data-fetching pattern: student_profiles has
// no school_id/FK Supabase can embed, so students are scoped via
// profiles first, then matched against student_profiles in JS.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CertificatesClient from './CertificatesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Certificates | SchoolOS' }

export interface GraduatedStudent {
  id: string
  full_name: string
  admission_number: string
  class_name: string
  graduation_year: number | null
  avatar_url: string | null
}

export default async function CertificatesPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || profile.role !== 'principal') redirect('/login')
  const school = (profile as any)?.schools ?? null

  const { data: schoolStudents } = await supabase
    .from('profiles').select('id, full_name, avatar_url')
    .eq('school_id', profile.school_id).eq('role', 'student')

  const studentIds = (schoolStudents ?? []).map((p: any) => p.id)
  const profileById = Object.fromEntries((schoolStudents ?? []).map((p: any) => [p.id, p]))

  const { data: spRows } = studentIds.length > 0
    ? await supabase.from('student_profiles')
        .select('id, class_id, admission_number, graduation_year, lifecycle_stage')
        .in('id', studentIds).eq('lifecycle_stage', 'graduated')
        .order('graduation_year', { ascending: false })
    : { data: [] as any[] }

  const classIds = Array.from(new Set((spRows ?? []).map((s: any) => s.class_id).filter(Boolean))) as string[]
  const { data: classRows } = classIds.length > 0
    ? await supabase.from('classes').select('id, name').in('id', classIds)
    : { data: [] as any[] }
  const classById = Object.fromEntries((classRows ?? []).map((c: any) => [c.id, c]))

  const graduatedStudents: GraduatedStudent[] = (spRows ?? []).map((r: any) => ({
    id: r.id,
    full_name: profileById[r.id]?.full_name ?? 'N/A',
    admission_number: r.admission_number ?? 'N/A',
    class_name: classById[r.class_id]?.name ?? 'N/A',
    graduation_year: r.graduation_year ?? null,
    avatar_url: profileById[r.id]?.avatar_url ?? null,
  }))

  return (
    <CertificatesClient
      graduatedStudents={graduatedStudents}
      school={school}
      profile={profile}
      userId={user.id}
    />
  )
}
