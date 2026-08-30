// src/app/dashboard/hostel/chat/page.tsx
// Same thin-wrapper shape as every other role's chat page. Gated via
// requireHostelStaff, same as the rest of this dashboard tree (see
// dashboard/hostel/page.tsx), not a profile.role check, since Warden/
// Assistant Warden/House Parent/Hostel Administrator are appointments on
// top of a teacher base role, principal and secretary pass automatically
// per requireHostelStaff's own rule.

import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { requireHostelStaff } from '@/lib/permissions'
import UniversalChatPage from '@/components/UniversalChatPage'

export default async function HostelChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const access = await requireHostelStaff(admin, user.id)
  if (!access) redirect('/dashboard')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null
  const schoolColor = school?.primary_color ?? '#800020'

  return (
    <UniversalChatPage
      profile={profile} school={school}
      userId={user.id} role="hostel"
      schoolColor={schoolColor}
    />
  )
}
