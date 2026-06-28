// lib/subscription.ts
// Call this at the top of every non-principal dashboard page.tsx server component.
// Returns { locked: true, status, school } if the school's subscription is lapsed.
// The page then renders <SubscriptionGate> instead of the normal dashboard content.

import { createClient } from '@/lib/supabase/server'

export interface SubscriptionCheck {
  locked:      boolean
  status:      string
  schoolName:  string
  schoolColor: string
}

export async function checkSubscription(userId: string): Promise<SubscriptionCheck> {
  const supabase = await createClient()

  // Get the user's school_id and role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', userId)
    .single()

  // Principals are never locked
  if (!profile || profile.role === 'principal' || !profile.school_id) {
    return { locked: false, status: 'active', schoolName: '', schoolColor: '#7C3AED' }
  }

  // Get the school's lock status and branding
  const { data: school } = await supabase
    .from('schools')
    .select('name, primary_color, setup_status, is_platform_active')
    .eq('id', profile.school_id)
    .single()

  if (!school) {
    return { locked: false, status: 'active', schoolName: '', schoolColor: '#7C3AED' }
  }

  const isLocked =
    !school.is_platform_active ||
    school.setup_status === 'locked'    ||
    school.setup_status === 'expired'   ||
    school.setup_status === 'suspended'

  return {
    locked:      isLocked,
    status:      school.setup_status,
    schoolName:  school.name,
    schoolColor: school.primary_color ?? '#7C3AED',
  }
}
