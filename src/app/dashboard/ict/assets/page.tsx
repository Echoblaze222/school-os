// src/app/dashboard/ict/assets/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { getIctAppointment } from '@/lib/permissions'
import AssetsClient           from './AssetsClient'

export default async function IctAssetsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('school_id, schools(primary_color)').eq('id', user.id).single()
  if (!profile?.school_id) redirect('/login')

  const admin = createAdminClient()
  const appointment = await getIctAppointment(admin, user.id, profile.school_id)
  if (!appointment) redirect('/dashboard')

  const { data: assets } = await admin
    .from('ict_assets')
    .select('id, asset_tag, device_type, name, serial_number, location, status, condition, assigned_to_dept')
    .eq('school_id', profile.school_id)
    .order('asset_tag', { ascending: true })
    .limit(200)

  const school = (profile as any).schools ?? null

  return (
    <AssetsClient
      initialAssets={assets ?? []}
      schoolColor={school?.primary_color ?? '#800020'}
    />
  )
}
