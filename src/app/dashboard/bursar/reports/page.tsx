import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ReportsClient from './ReportsClient'
import { checkSubscription }  from '@/lib/subscription'       // ← ADD THIS IMPORT
import SubscriptionGate       from '@/components/SubscriptionGate'
export default async function ReportsPage() {
  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null
  // ── Subscription check ───────────────────────────────────────────────────
  // ADD THIS BLOCK to every non-principal dashboard page
  const sub = await checkSubscription(user.id)
  if (sub.locked) {
    return (
      <SubscriptionGate
        schoolName={sub.schoolName}
        schoolColor={sub.schoolColor}
        status={sub.status as any}
      />
    )
  }
  // ── End subscription check ───────────────────────────────────────────────

  // ... rest of your existing page data-fetching and return ...
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  return <ReportsClient profile={profile} school={school} userId={user.id} />
}
