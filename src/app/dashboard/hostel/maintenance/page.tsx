// src/app/dashboard/hostel/maintenance/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { requireHostelStaff } from '@/lib/permissions'
import MaintenanceClient from './MaintenanceClient'

export default async function HostelMaintenancePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const auth = await requireHostelStaff(adminClient, user.id)
  if (!auth) redirect('/dashboard')

  const { data: hostels } = await adminClient
    .from('hostels').select('id, name').eq('school_id', auth.profile.school_id).order('name')

  return <MaintenanceClient hostels={hostels ?? []} />
}
