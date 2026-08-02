// src/app/dashboard/student/library/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LibraryClient from './LibraryClient'

export default async function StudentLibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'student') redirect('/login')
  const school = (profile as any)?.schools ?? null

  const { data: books } = await supabase
    .from('library_books')
    .select('id, title, author, category, available_copies, total_copies, shelf_location')
    .eq('school_id', profile.school_id)
    .order('title', { ascending: true })

  const { data: myLoans } = await supabase
    .from('library_loans')
    .select('*, library_books(title, author)')
    .eq('student_id', user.id)
    .order('borrowed_at', { ascending: false })

  return (
    <LibraryClient
      books={books ?? []}
      myLoans={myLoans ?? []}
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
}
