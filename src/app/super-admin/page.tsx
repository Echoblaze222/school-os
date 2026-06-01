import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SuperAdminDashboard from './SuperAdminDashboard'

export const metadata = { title: 'Super Admin — SchoolOS' }

export default async function SuperAdminPage() {
  const supabase =await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/super-admin/login')

  // Verify super admin
  const { data: sa } = await supabase
    .from('super_admins').select('id').eq('id', session.user.id).single()
  if (!sa) redirect('/login')

  return <SuperAdminDashboard />
}
