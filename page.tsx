import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UniversalAIPage from '@/components/UniversalAIPage'

export default async function CoachAiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()

  const school = (profile as any)?.schools ?? null
  return (
    <UniversalAIPage
      profile={profile} school={school}
      userId={user.id} role="coach"
    />
  )
}
