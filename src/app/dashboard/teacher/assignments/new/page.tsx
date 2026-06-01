// src/app/dashboard/teacher/assignments/new/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import NewAssignmentClient from './NewAssignmentClient'

export const metadata = { title: 'Post Assignment — SchoolOS' }

export interface TeacherClassOption {
  id: string
  name: string
  subject: string
}

export default async function NewAssignmentPage() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  const { data: classes, error } = await supabase
    .from('classes')
    .select('id, name, subject')
    .eq('teacher_id', user.id)
    .order('name')

  if (error) console.error('[new-assignment] classes error:', error.message)

  return (
    <NewAssignmentClient
      classes={(classes ?? []) as TeacherClassOption[]}
      teacherId={user.id}
    />
  )
}
