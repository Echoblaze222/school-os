// lib/subscription.ts
// Call this at the top of every dashboard page.tsx server component,
// including the principal's.
//
// Two different kinds of lock, handled differently:
//  - HARD lock ('locked' status, or is_platform_active=false): a super admin
//    has manually suspended the school (e.g. abuse, non-payment escalation).
//    Nobody gets in, including the principal.
//  - BILLING lock ('expired' trial or 'suspended' subscription): the school
//    just needs to pay. Non-principal roles are fully gated with
//    <SubscriptionGate>. The principal is allowed to keep logging in, but
//    ONLY to reach /dashboard/principal/subscriptions to renew — see
//    middleware.ts, which redirects any other principal route there.
//
// Previously principals were exempted from ALL lock states everywhere
// (this file, middleware.ts, and the principal page.tsx never called this
// check at all) — meaning an expired/suspended school kept working in full
// through the principal account indefinitely. That's the bug this fixes.

import { createClient } from '@/lib/supabase/server'

export interface SubscriptionCheck {
  locked:      boolean
  hardLocked:  boolean   // true = super-admin suspended, blocks EVERYONE incl. principal
  status:      string
  schoolName:  string
  schoolColor: string
}

export async function checkSubscription(userId: string): Promise<SubscriptionCheck> {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userId)
    .single()

  if (!profile || !profile.school_id) {
    return { locked: false, hardLocked: false, status: 'active', schoolName: '', schoolColor: '#7C3AED' }
  }

  const { data: school } = await supabase
    .from('schools')
    .select('name, primary_color, setup_status, is_platform_active')
    .eq('id', profile.school_id)
    .single()

  if (!school) {
    return { locked: false, hardLocked: false, status: 'active', schoolName: '', schoolColor: '#7C3AED' }
  }

  const hardLocked = !school.is_platform_active || school.setup_status === 'locked'
  const billingLocked = school.setup_status === 'expired' || school.setup_status === 'suspended'

  // Principals bypass the BILLING lock (they need to reach the renewal
  // page) but never the HARD lock — a manual super-admin suspension blocks
  // everyone, principal included.
  const isPrincipal = profile.role === 'principal'
  const locked = hardLocked || (billingLocked && !isPrincipal)

  return {
    locked,
    hardLocked,
    status:      school.setup_status,
    schoolName:  school.name,
    schoolColor: school.primary_color ?? '#7C3AED',
  }
}
