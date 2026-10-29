// src/lib/supabase/authUser.ts
//
// The signed-in user for SERVER-RENDERED PAGES AND LAYOUTS (read-only views).
//
// Why this exists
// ───────────────
// Pages used to call `supabase.auth.getUser()`, which is a network round-trip
// to Supabase Auth, and a page, its layout and `checkSubscription()` each did
// it again on every request. Supabase's current server-side guidance is to
// use `getClaims()` to protect pages: it verifies the session JWT's signature
// locally against the project's public signing keys (no network call when the
// project uses asymmetric keys, which this one does - ECC P-256) and falls
// back to `getUser()` on its own for legacy HS256 projects.
//
// `cache()` makes the result shared by everything rendered in the same
// request (layout + page + helpers), so verification happens once.
//
// What this is NOT for
// ────────────────────
// API routes, server actions and anything that WRITES (payments, grades,
// account changes) should keep calling `supabase.auth.getUser()`: a mutation
// should see a revoked session immediately, whereas local verification only
// notices when the access token expires (default 1 hour). Rendering a page
// the user was already allowed to see for up to an hour is an acceptable
// trade; changing data is not. Database row-level security still applies to
// every query regardless.

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

export interface AuthUser {
  id: string
  email?: string
}

export const getAuthUser = cache(async (): Promise<AuthUser | null> => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  const claims = data?.claims
  if (!claims?.sub) return null
  return {
    id: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : undefined,
  }
})
