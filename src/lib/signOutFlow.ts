// src/lib/signOutFlow.ts
// Shared sign-out helper used by every "Log out" button across role dashboards.
//
// Behaviour:
//  1. Snapshots the currently selected school into `schoolos_recent_school`
//     so /select-school can offer a "Continue with [School]" pill next time.
//  2. Clears the active-school key so /login can't be reached without
//     re-selecting a school first.
//  3. Signs out of Supabase.
//  4. Sends the user to /select-school (not /login) — they must pick a
//     school again before they can log back in.
//
// Optional `reason` (e.g. 'timeout') is stashed in sessionStorage and
// carried through /select-school onto /login as `?reason=...`, so banners
// like "you were signed out due to inactivity" still show up after the
// user re-picks their school.

import type { SupabaseClient } from '@supabase/supabase-js'

const SCHOOL_KEY         = 'schoolos_selected_school'
const RECENT_SCHOOL_KEY  = 'schoolos_recent_school'
const SIGNOUT_REASON_KEY = 'schoolos_signout_reason'

interface StoredSchool {
  id: string
  name: string
  primaryColor: string | null
}

export async function signOutFlow(
  supabase: SupabaseClient,
  router: { push: (href: string) => void; replace?: (href: string) => void; refresh?: () => void },
  reason?: string
) {
  try {
    const stored = localStorage.getItem(SCHOOL_KEY)
    if (stored) {
      const school: StoredSchool = JSON.parse(stored)
      localStorage.setItem(RECENT_SCHOOL_KEY, JSON.stringify({
        id: school.id,
        name: school.name,
        primaryColor: school.primaryColor || '#7C3AED',
        logoUrl: null,
      }))
    }
  } catch {
    // Non-fatal — worst case, no "continue with" pill shows next time.
  }

  localStorage.removeItem(SCHOOL_KEY)

  if (reason) {
    sessionStorage.setItem(SIGNOUT_REASON_KEY, reason)
  }

  try { await supabase.auth.signOut() } catch { /* proceed regardless */ }

  const nav = router.replace ?? router.push
  // A hard navigation, not a client-side route change: signing out is an
  // identity change, and Next's client Router Cache doesn't know that —
  // it can keep a signed-in dashboard page cached and hand it straight
  // back to whoever logs in next on this device. window.location forces
  // a full page load, which throws that cache away completely.
  if (typeof window !== 'undefined') {
    window.location.href = '/select-school'
  } else {
    nav('/select-school')
    router.refresh?.()
  }
}
