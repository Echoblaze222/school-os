// src/app/dashboard/ict/account-requests/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { getIctAppointment } from '@/lib/permissions'
import AccountRequestsClient  from './AccountRequestsClient'

export default async function IctAccountRequestsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('school_id, schools(primary_color)').eq('id', user.id).single()
  if (!profile?.school_id) redirect('/login')

  const admin = createAdminClient()
  const appointment = await getIctAppointment(admin, user.id, profile.school_id)
  if (!appointment) redirect('/dashboard')

  const { data: rawRequests } = await admin
    .from('ict_account_requests')
    .select('id, requested_by, request_type, description, status, resolution_note, created_at, resolved_at, profiles!ict_account_requests_requested_by_fkey(full_name, role)')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })
    .limit(100)

  // Same to-one !fkey array-vs-object normalization as ict/tickets/page.tsx.
  const requests = (rawRequests ?? []).map((r: any) => ({
    ...r,
    profiles: Array.isArray(r.profiles) ? r.profiles[0] : r.profiles,
  }))

  const school = (profile as any).schools ?? null

  return (
    <AccountRequestsClient
      initialRequests={requests}
      schoolColor={school?.primary_color ?? '#800020'}
    />
  )
}
