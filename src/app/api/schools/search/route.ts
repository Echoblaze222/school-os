// src/app/api/schools/search/route.ts
// Public, unauthenticated school lookup for the "Find Your School" page.
//
// SECURITY NOTE: this route is reachable by anyone, logged in or not.
// It uses the admin client so we can attach the principal's name without
// granting anonymous users a broader RLS read on `profiles` (which holds
// emails, phones, and — critically — `default_code` / access codes used
// to log in). We deliberately select ONLY `full_name` from `profiles` and
// never forward `default_code`, `email`, `phone`, or any other field.
// Do not widen the `.select()` below without re-checking this.

import { NextResponse }      from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()

  if (q.length < 2) {
    return NextResponse.json({ schools: [] })
  }

  const supabase = createAdminClient()

  const { data: schools, error } = await supabase
    .from('schools')
    .select('id, name, city, state, primary_color, logo_url, tagline, school_type, is_platform_active, setup_status')
    .ilike('name', `%${q}%`)
    // FIX: .not('setup_status', 'in', '(...)') silently drops rows where
    // setup_status IS NULL — Postgres evaluates NOT (NULL IN (...)) as NULL,
    // not true, so the WHERE clause excludes them. Using .or() to explicitly
    // keep NULL alongside anything not in the excluded list.
    .or('setup_status.is.null,setup_status.not.in.(suspended,locked,expired)')
    .limit(8)

  if (error) {
    console.error('[schools/search] query failed:', error.message, error)
    return NextResponse.json({ error: 'Search failed' }, { status: 500 })
  }
  if (!schools?.length) {
    return NextResponse.json({ schools: [] })
  }

  // Look up each school's principal — full_name ONLY. Never select
  // default_code/email/phone here; this response is public.
  const { data: principals } = await supabase
    .from('profiles')
    .select('school_id, full_name')
    .in('school_id', schools.map(s => s.id))
    .eq('role', 'principal')

  const principalByCwSchool = new Map<string, string>()
  for (const p of principals ?? []) {
    if (p.school_id && p.full_name) principalByCwSchool.set(p.school_id, p.full_name)
  }

  const enriched = schools.map(s => ({
    ...s,
    principal_name: principalByCwSchool.get(s.id) ?? null,
  }))

  return NextResponse.json({ schools: enriched })
}
