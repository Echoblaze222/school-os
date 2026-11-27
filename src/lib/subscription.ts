// lib/subscription.ts
// Call this at the top of every dashboard page.tsx server component.
//
// Billing is now PER STUDENT (see sql/migrations/2026-11-21-per-student-
// subscriptions.sql). A school never locks because of money; only an
// individual student whose term subscription is unpaid (after the term's
// grace window) is locked. Staff, principals and parents are never
// billing-locked.
//
// Two kinds of lock remain:
//  - HARD lock ('locked' status, 'expired' unpaid-setup trial, or
//    is_platform_active=false): a super admin suspended the school or the
//    initial setup was never paid. Nobody gets in, including the principal.
//  - STUDENT lock: a student with no paid subscription for the current term
//    once the grace window has passed. Only that student is gated.
//
// middleware.ts enforces both on navigation; this is the defence-in-depth
// copy each page calls, matching the codebase's two-layer pattern.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface SubscriptionCheck {
  locked:      boolean
  hardLocked:  boolean   // true = super-admin suspended / unpaid setup, blocks EVERYONE
  status:      string
  schoolName:  string
  schoolColor: string
  studentLocked?: boolean // true = this student's own term subscription is unpaid
}

export const checkSubscription = cache(async function checkSubscription(userId: string): Promise<SubscriptionCheck> {
  const supabase = await createClient()

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id, school:schools!profiles_school_id_fkey(name, primary_color, setup_status, is_platform_active)')
    .eq('id', userId)
    .single()

  if (!profile || !profile.school_id) {
    return { locked: false, hardLocked: false, status: 'active', schoolName: '', schoolColor: '#7C3AED' }
  }

  // An embedded to-one relation can be typed as an object or a one-item array.
  const embedded = (profile as { school?: unknown }).school
  const school = (Array.isArray(embedded) ? embedded[0] : embedded) as
    | { name: string; primary_color: string | null; setup_status: string; is_platform_active: boolean }
    | null
    | undefined

  if (!school) {
    return { locked: false, hardLocked: false, status: 'active', schoolName: '', schoolColor: '#7C3AED' }
  }

  const hardLocked =
    !school.is_platform_active ||
    school.setup_status === 'locked' ||
    school.setup_status === 'expired'

  // Per-student lock. The RPC fails open (returns locked:false) when no term
  // is configured, and a missing RPC (migration not applied yet) yields no
  // data, which is also treated as not locked.
  let studentLocked = false
  if (!hardLocked && profile.role === 'student') {
    const { data: lock } = await supabase.rpc('my_subscription_lock')
    studentLocked = !!(lock as { locked?: boolean } | null)?.locked
  }

  return {
    locked:      hardLocked || studentLocked,
    hardLocked,
    studentLocked,
    status:      studentLocked ? 'student_unpaid' : school.setup_status,
    schoolName:  school.name,
    schoolColor: school.primary_color ?? '#7C3AED',
  }
})
