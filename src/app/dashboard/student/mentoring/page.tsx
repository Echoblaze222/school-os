// src/app/dashboard/student/mentoring/page.tsx
import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MentoringClient from './MentoringClient'

export const metadata = { title: 'Peer Mentoring | SchoolOS' }

export default async function StudentMentoringPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  // Mentoring is a student-to-student feature; other roles use their own pages.
  if ((profile as any)?.role !== 'student') redirect('/dashboard')

  const school = (profile as any)?.schools ?? null

  return <MentoringClient profile={profile} school={school} userId={user.id} />
}
