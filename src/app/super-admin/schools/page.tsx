import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import SchoolsPageClient from './SchoolsPageClient'

export const metadata = { title: 'All Schools — SchoolOS Admin' }

export default async function SchoolsPage() {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/super-admin/login')

  const { data: sa } = await supabase
    .from('super_admins').select('id').eq('id', session.user.id).single()
  if (!sa) redirect('/login')

  const { data: schools } = await supabase
    .from('school_subscription_summary')
    .select('*')
    .order('setup_status', { ascending: true })

  return <SchoolsPageClient schools={schools ?? []} />
}
