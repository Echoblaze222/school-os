// src/app/principal/settings/page.tsx
// Principal Settings — school identity, logo & build image management

import { createClient }    from '@/lib/supabase/server'
import { redirect }        from 'next/navigation'
import SettingsClient      from './SettingsClient'

export default async function PrincipalSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verify the caller is a principal
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, school_id, role')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'principal') redirect('/')

  // Fetch the school record owned by this principal
  const { data: school } = await supabase
    .from('schools')
    .select(
      'id, name, tagline, address, city, state, phone, email, ' +
      'school_type, primary_color, font_family, ' +
      'logo_url, build_image_url, status, subscription_plan'
    )
    .eq('id', profile.school_id)
    .single()

  if (!school) redirect('/')

  return (
    <SettingsClient
      profile={profile}
      school={school}
    />
  )
}
