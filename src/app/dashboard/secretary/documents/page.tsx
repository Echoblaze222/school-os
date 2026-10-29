// src/app/dashboard/secretary/documents/page.tsx
import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import DocumentsClient from './DocumentsClient'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')
  const school = (profile as any)?.schools ?? null

  const { data: docs } = await supabase
    .from('school_documents')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })

  return <DocumentsClient docs={docs ?? []} profile={profile} school={school} userId={user.id} />
}
