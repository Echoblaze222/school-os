// src/app/dashboard/principal/alumni/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalAlumniClient from './PrincipalAlumniClient'

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

  const { data, error } = await supabase
    .from('student_profiles')
    .select(`
      id, full_name, admission_number,
      email, phone, avatar_url,
      graduation_year, lifecycle_stage,
      classes ( name )
    `)
    .in('lifecycle_stage', ['graduated', 'alumni'])
    .order('graduation_year', { ascending: false })

  if (error) console.error('[alumni-principal] fetch error:', error.message)

  const alumni: AlumniStudent[] = (data ?? []).map((r: any) => ({
    id:               r.id,
    full_name:        r.full_name ?? '—',
    admission_number: r.admission_number ?? '—',
    class_name:       r.classes?.name ?? '—',
    graduation_year:  r.graduation_year ?? null,
    email:            r.email ?? null,
    phone:            r.phone ?? null,
    avatar_url:       r.avatar_url ?? null,
    lifecycle_stage:  r.lifecycle_stage ?? 'alumni',
  }))

  return <PrincipalAlumniClient alumni={alumni} />
}
