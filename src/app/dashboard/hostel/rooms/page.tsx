// src/app/dashboard/hostel/rooms/page.tsx
import { getAuthUser } from '@/lib/supabase/authUser'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { requireHostelStaff } from '@/lib/permissions'
import RoomsClient from './RoomsClient'

export default async function HostelRoomsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const adminClient = createAdminClient()
  const auth = await requireHostelStaff(adminClient, user.id)
  if (!auth) redirect('/dashboard')

  return <RoomsClient />
}
