// src/app/dashboard/student/certificates/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StudentCertificatesClient from './StudentCertificatesClient'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'My Certificate | SchoolOS' }

export default async function StudentCertificatesPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile || profile.role !== 'student') redirect('/login')
  const school = (profile as any)?.schools ?? null

  return <StudentCertificatesClient userId={user.id} profile={profile} school={school} />
}
