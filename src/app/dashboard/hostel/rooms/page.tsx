// src/app/dashboard/hostel/rooms/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { requireHostelStaff } from '@/lib/permissions'
import RoomsClient from './RoomsClient'

export default async function HostelRoomsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const auth = await requireHostelStaff(adminClient, user.id)
  if (!auth) redirect('/dashboard')

  return <RoomsClient />
}
