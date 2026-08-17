import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import StaffClient from './StaffClient'

export default async function StaffPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()
  // Middleware already redirects non-principal roles away from
  // /dashboard/principal/*. This is a second, explicit check at the page
  // level (same pattern as codes/page.tsx, settings/page.tsx, etc.) so the
  // screen never renders staff-management data if that ever changes.
  if (!profile || (profile as any).role !== 'principal') redirect('/login')
  const school = (profile as any)?.schools ?? null
  return <StaffClient profile={profile} school={school} userId={user.id} />
}
