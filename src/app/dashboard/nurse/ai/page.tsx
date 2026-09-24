import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UniversalAIPage from '@/components/UniversalAIPage'
import { SELF_PROFILE_SAFE_COLUMNS } from '@/lib/supabase/profileSelectors'

export default async function NurseAiPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select(`${SELF_PROFILE_SAFE_COLUMNS}, schools(*)`).eq('id', user.id).single()

  const school = (profile as any)?.schools ?? null
  return (
    <UniversalAIPage
      profile={profile} school={school}
      userId={user.id} role="nurse"
    />
  )
}
