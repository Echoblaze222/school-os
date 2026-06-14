import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import AnnouncementsClient from './AnnouncementsClient'

export default async function AnnouncementsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  return (
    <AnnouncementsClient
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
}