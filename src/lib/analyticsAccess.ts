// Server-side gate for analytics pages. The database re-checks the same rule
// (public.analytics_guard_any), so this is a UX redirect, not the security boundary.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function requireAnalyticsAccess(roles: string[], appointments: string[] = []) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  if (!profile) redirect('/login')
  const p = profile as any

  let ok = roles.includes(p.role)
  if (!ok && appointments.length && p.school_id) {
    const { data } = await supabase.from('appointments').select('id')
      .eq('profile_id', user.id).eq('school_id', p.school_id).eq('status', 'active')
      .in('appointment_type', appointments).limit(1).maybeSingle()
    ok = !!data
  }
  if (!ok) redirect('/login')

  return { userId: user.id, profile: p, school: p.schools ?? null }
}
