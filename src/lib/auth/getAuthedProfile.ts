// src/lib/auth/getAuthedProfile.ts
// Server-only. Fetches the signed-in user + their profile + their school
// in one place, wrapped in React's cache() so calling it from multiple
// places within the same request (a role's layout.tsx AND the page.tsx
// rendered beneath it, for example) only does the actual auth.getUser()
// + Supabase query once, not once per caller.
//
// WHY THIS EXISTS: every role layout.tsx (e.g. dashboard/principal/
// layout.tsx) independently calls auth.getUser() + fetches
// profile/schools(*) to inject the school's brand colors, and every
// page.tsx beneath it independently does the exact same auth.getUser() +
// profile/schools(*) fetch again to render its own content - two full
// round trips for identical data, on every single navigation, before
// either one's own page-specific queries even start. Confirmed by
// reading principal/layout.tsx and principal/page.tsx side by side; this
// is very likely the actual cause of "page by page navigation feels
// slow", not a missing loading state (loading.tsx already exists at the
// /dashboard level and correctly covers every nested route).
//
// React's cache() only memoizes for the lifetime of ONE request/render
// pass - a fresh navigation always re-runs this fully. That means it's
// safe to use even on routes that are deliberately force-dynamic /
// force-no-store for cross-user correctness (see principal/layout.tsx's
// own comment on why that's set) - cache() and force-dynamic solve two
// different problems (dedupe-within-a-request vs. freshness-across-
// requests) and don't conflict with each other.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export const getAuthedProfile = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { user: null, profile: null, school: null }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  return { user, profile, school }
})
