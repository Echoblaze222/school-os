import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UniversalChatPage from '@/components/UniversalChatPage'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null
  const schoolColor = school?.primary_color ?? '#00B4D8'
  return (
    <UniversalChatPage
      profile={profile} school={school}
      userId={user.id} role="coach"
      schoolColor={schoolColor}
    />
  )
}
