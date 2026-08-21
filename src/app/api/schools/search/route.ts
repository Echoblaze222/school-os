// src/app/api/schools/search/route.ts
// Public, unauthenticated school lookup for the "Find Your School" page.
//
// IMPORTANT: this MUST stay a server route using the admin/service-role
// client. `schools` holds sensitive columns (bank_name, account_number,
// account_name, notes) and is protected by RLS, so querying it from the
// browser with the anon key will return nothing for anonymous visitors.
// This route runs server-side, selects only the safe public fields below,
// and never forwards default_code/email/phone/bank fields to the client.

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (q.length < 2) {
    return NextResponse.json({ schools: [] })
  }

  const supabase = createAdminClient()

  // Public + unauthenticated, so rate limit by IP only. Generous limit —
  // this backs live-as-you-type search on the "Find Your School" page,
  // it just needs to stop scripted enumeration of the whole `schools`
  // table, not slow down a real visitor typing.
  const rl = await checkRateLimit(supabase, 'schools_search', getClientIp(request), 60, 60)
  if (!rl.allowed) {
    return NextResponse.json({ error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })
  }

  const { data: schools, error } = await supabase
    .from('schools')
    .select('id, name, city, state, primary_color, logo_url, tagline, school_type, is_platform_active, setup_status')
    .ilike('name', `%${q}%`)
    // Only hide schools explicitly suspended/locked/expired. Trial schools
    // (setup_status defaults to 'trial') and schools with is_platform_active
    // still false (pre-payment) should still be findable/loggable-into.
    .or('setup_status.is.null,setup_status.not.in.(suspended,locked,expired)')
    .limit(8)

  if (error) {
    console.error('[schools/search] query failed:', error.message, error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
  if (!schools?.length) {
    return NextResponse.json({ schools: [] })
  }

  // Principal name ONLY (for parents to confirm they picked the right
  // school) — never default_code, email, or phone.
  const { data: principals } = await supabase
    .from('profiles')
    .select('school_id, full_name')
    .in('school_id', schools.map(s => s.id))
    .eq('role', 'principal')

  const principalBySchool = new Map<string, string>()
  for (const p of principals ?? []) {
    if (p.school_id && p.full_name) principalBySchool.set(p.school_id, p.full_name)
  }

  const enriched = schools.map(s => ({
    ...s,
    principal_name: principalBySchool.get(s.id) ?? null,
  }))

  return NextResponse.json({ schools: enriched })
}
