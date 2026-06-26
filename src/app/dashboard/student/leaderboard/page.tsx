import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import LeaderboardClient from './LeaderboardClient'

export default async function LeaderboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null
  const role   = (profile as any)?.role

  // ── Parent: fetch all linked children IDs ──
  let childIds: string[] = []
  if (role === 'parent') {
    const { data: links } = await supabase
      .from('parent_student_links')
      .select('student_id')
      .eq('parent_id', user.id)
      .eq('status', 'active')   // only approved links
    childIds = (links ?? []).map((l: any) => l.student_id)
  }

  return (
    <LeaderboardClient
      profile={profile}
      school={school}
      userId={user.id}
      childIds={childIds}
    />
  )
}
