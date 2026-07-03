// src/app/dashboard/principal/alumni/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalAlumniClient from './PrincipalAlumniClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Alumni — SchoolOS' }

export interface AlumniStudent {
  id: string
  full_name: string
  admission_number: string
  class_name: string
  graduation_year: string | null
  email: string | null
  phone: string | null
  avatar_url: string | null
  lifecycle_stage: string
}

export default async function PrincipalAlumniPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'principal') redirect('/login')

  const { data: school } = await supabase
    .from('school_branding')
    .select('id, school_name, logo_url, primary_color')
    .eq('id', profile.school_id)
    .single()

  // student_profiles has no school_id column and no FK Supabase can use
  // for a nested select into profiles/classes, so: first get this school's
  // student ids from `profiles`, then pull matching graduated rows from
  // student_profiles, then fetch classes — merging everything in JS. Same
  // separate-query pattern used across the rest of the app.
  const { data: schoolStudentProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, avatar_url')
    .eq('school_id', profile.school_id)
    .eq('role', 'student')

  const schoolStudentIds = (schoolStudentProfiles ?? []).map((p: any) => p.id)
  const profileById = Object.fromEntries((schoolStudentProfiles ?? []).map((p: any) => [p.id, p]))

  const { data: spRows, error: spError } = schoolStudentIds.length > 0
    ? await supabase
        .from('student_profiles')
        .select('id, class_id, admission_number, graduation_year, lifecycle_stage')
        .in('id', schoolStudentIds)
        .in('lifecycle_stage', ['graduated', 'alumni'])
        .order('graduation_year', { ascending: false })
    : { data: [] as any[], error: null }

  if (spError) console.error('[alumni-principal] student_profiles fetch error:', spError.message)

  const classIds = Array.from(new Set((spRows ?? []).map((s: any) => s.class_id).filter(Boolean))) as string[]
  const { data: classRows } = classIds.length > 0
    ? await supabase.from('classes').select('id, name').in('id', classIds)
    : { data: [] as any[] }

  const classById = Object.fromEntries((classRows ?? []).map((c: any) => [c.id, c]))

  const alumni: AlumniStudent[] = (spRows ?? []).map((r: any) => {
    const p = profileById[r.id] ?? {}
    return {
      id:               r.id,
      full_name:        p.full_name ?? '—',
      admission_number: r.admission_number ?? '—',
      class_name:       classById[r.class_id]?.name ?? '—',
      graduation_year:  r.graduation_year ? String(r.graduation_year) : null,
      email:            p.email ?? null,
      phone:            p.phone ?? null,
      avatar_url:       p.avatar_url ?? null,
      lifecycle_stage:  r.lifecycle_stage ?? 'alumni',
    }
  })

  return (
    <PrincipalAlumniClient
      alumni={alumni}
      userId={user.id}
      profile={profile}
      school={school}
      role={profile.role}
      schoolColor={school?.primary_color ?? '#7C3AED'}
    />
  )
}
