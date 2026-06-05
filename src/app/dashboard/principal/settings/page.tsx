// src/app/dashboard/principal/settings/page.tsx
// FIXED: 'build_image_url' → 'login_bg_image' (actual column in schools table)

import { createClient }   from '@/lib/supabase/server'
import { redirect }       from 'next/navigation'
import SettingsClient     from './SettingsClient'

interface School {
  id:               string
  name:             string
  tagline:          string | null
  address:          string | null
  city:             string | null
  state:            string | null
  phone:            string | null
  email:            string | null
  school_type:      string | null
  primary_color:    string | null
  font_family:      string | null
  logo_url:         string | null
  login_bg_image:   string | null   // ← correct column name
  status:           string | null
  subscription_plan: string | null
}

interface Profile {
  id:        string
  full_name: string
  email:     string
  phone:     string
  school_id: string
  role:      string
}

export default async function PrincipalSettingsPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profileData } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, school_id, role')
    .eq('id', user.id)
    .single()

  const profile = profileData as Profile | null
  if (!profile || profile.role !== 'principal') redirect('/')

  const { data: schoolData } = await supabase
    .from('schools')
    .select(
      'id, name, tagline, address, city, state, phone, email, ' +
      'school_type, primary_color, font_family, ' +
      'logo_url, login_bg_image, status, subscription_plan'  // ← login_bg_image
    )
    .eq('id', profile.school_id)
    .single()

  const school = schoolData as School | null
  if (!school) redirect('/')

  return (
    <SettingsClient
      profile={profile}
      school={school}
    />
  )
}
