// src/app/dashboard/secretary/library/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LibraryClient from './LibraryClient'

export default async function LibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')
  const school = (profile as any)?.schools ?? null

  const { data: books } = await supabase
    .from('library_books')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('title', { ascending: true })

  const { data: loans } = await supabase
    .from('library_loans')
    .select('*, library_books(title, author), profiles!library_loans_student_id_fkey(full_name, default_code)')
    .eq('school_id', profile.school_id)
    .order('borrowed_at', { ascending: false })

  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, default_code')
    .eq('school_id', profile.school_id)
    .eq('role', 'student')
    .order('full_name', { ascending: true })

  return (
    <LibraryClient
      books={books ?? []}
      loans={loans ?? []}
      students={students ?? []}
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
}
