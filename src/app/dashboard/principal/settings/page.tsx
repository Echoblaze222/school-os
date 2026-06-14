// src/app/dashboard/principal/settings/page.tsx

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import SettingsClient   from './SettingsClient'

export default async function PrincipalSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('[principal/settings] profile fetch error:', profileError)
    redirect('/login')
  }

  if (!profile || profile.role !== 'principal') redirect('/')

  const school = (profile as any).schools ?? null

  if (!school) {
    console.error('[principal/settings] no school linked to profile:', user.id)
    redirect('/')
  }

  return (
    <SettingsClient
      profile={{
        id:        profile.id,
        full_name: profile.full_name,
        email:     profile.email,
        phone:     profile.phone ?? '',
        school_id: profile.school_id,
        role:      profile.role,
      }}
      school={{
        id:               school.id,
        name:             school.name,
        tagline:          school.tagline          ?? null,
        address:          school.address          ?? null,
        city:             school.city             ?? null,
        state:            school.state            ?? null,
        phone:            school.phone            ?? null,
        email:            school.email            ?? null,
        school_type:      school.school_type      ?? null,
        primary_color:    school.primary_color    ?? '#800020',
        font_family:      school.font_family      ?? 'Inter',
        logo_url:         school.logo_url         ?? null,
        build_image_url:  school.build_image_url  ?? null,
        login_bg_image:   school.login_bg_image   ?? null,
        status:           school.status           ?? null,
        subscription_plan: school.subscription_plan ?? null,
      }}
    />
  )
}
