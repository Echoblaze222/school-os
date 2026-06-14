import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SchoolsPageClient from './SchoolsPageClient'

export const metadata = { title: 'All Schools — SchoolOS Admin' }

export default async function SchoolsPage() {
  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/super-admin/login')

  const { data: sa } = await supabase
    .from('platform_admins').select('id').eq('id', user.id).single()
  if (!sa) redirect('/login')

  const { data: schools } = await supabase
    .from('school_subscription_summary')
    .select('*')
    .order('setup_status', { ascending: true })

  return <SchoolsPageClient schools={schools ?? []} />
}
