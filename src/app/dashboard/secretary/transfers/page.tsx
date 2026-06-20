// src/app/dashboard/secretary/transfers/page.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import TransfersClient from './TransfersClient'

export default async function TransfersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any[]) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'secretary') redirect('/login')
  const { data: school } = await supabase.from('school_branding').select('*').eq('id', profile.school_id).single()

  // Transfers this school has sent out (origin) and received (destination),
  // so the secretary can track both directions in one place.
  // NOTE: `student_transfers` has no FK constraints in the schema, so nested
  // embeds like `schools!destination_school_id(...)` aren't reliable here —
  // fetch schools separately and join client-side instead.
  const { data: sent } = await supabase
    .from('student_transfers')
    .select(`
      id, student_id, status, requested_at, approved_at, completed_at, rejection_reason,
      has_outstanding_fees, outstanding_amount, debt_acknowledged, from_class, to_class,
      origin_school_id, destination_school_id
    `)
    .eq('origin_school_id', profile.school_id)
    .order('requested_at', { ascending: false })

  const { data: received } = await supabase
    .from('student_transfers')
    .select(`
      id, student_id, status, requested_at, approved_at, completed_at, rejection_reason,
      has_outstanding_fees, outstanding_amount, debt_acknowledged, from_class, to_class,
      origin_school_id, destination_school_id
    `)
    .eq('destination_school_id', profile.school_id)
    .order('requested_at', { ascending: false })

  // Student names for whichever transfers came back — resolved client-side via this map
  const studentIds = [...new Set([...(sent ?? []), ...(received ?? [])].map((t: any) => t.student_id))]
  const { data: studentProfiles } = studentIds.length
    ? await supabase.from('profiles').select('id, full_name, admission_number').in('id', studentIds)
    : { data: [] }

  // Same for the other school in each transfer (the one that isn't this school)
  const schoolIds = [...new Set([...(sent ?? []).map((t: any) => t.destination_school_id), ...(received ?? []).map((t: any) => t.origin_school_id)])]
  const { data: otherSchools } = schoolIds.length
    ? await supabase.from('schools').select('id, name, city').in('id', schoolIds)
    : { data: [] }

  return (
    <TransfersClient
      sent={sent ?? []}
      received={received ?? []}
      studentProfiles={studentProfiles ?? []}
      schools={otherSchools ?? []}
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
    }
    
