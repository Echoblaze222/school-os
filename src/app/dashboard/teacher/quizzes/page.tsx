// src/app/dashboard/teacher/quizzes/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QuizzesClient from './QuizzesClient'

export default async function TeacherQuizzesPage() {
  const supabase = await createClient()

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  if (!profile || !['teacher', 'admin'].includes((profile as any).role)) {
    redirect('/dashboard/student')
  }

  return (
    <QuizzesClient
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
}
