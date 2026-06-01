import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UniversalChatPage from '@/components/UniversalChatPage'

export default async function ChatPage() {
  const supabase =await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school = (profile as any)?.schools ?? null
  const schoolColor = school?.primary_color ?? '#7C3AED'
  return (
    <UniversalChatPage
      profile={profile} school={school}
      userId={session.user.id} role="principal"
      schoolColor={schoolColor}
    />
  )
}
