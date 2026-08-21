// src/app/api/apply/roles/route.ts
//
// appointment_types is only readable by `authenticated` role (see its RLS
// policy comment in identity-appointments-schema.sql: "readable by any
// authenticated user... not tenant data", deliberately excludes anon).
// The public /apply form runs unauthenticated, so it can't read that
// table directly; this route serves the admin-client read back out,
// filtered to exactly what self-service application is allowed to
// offer (excluding Principal/Bursar, same list /api/apply enforces on
// submit, kept in one place so the two can't drift apart).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const EXCLUDED_ROLES = ['principal', 'bursar']

export async function GET() {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('appointment_types')
    .select('id, label, category')
    .eq('is_active', true)
    .order('label', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const roles = (data ?? []).filter(r => !EXCLUDED_ROLES.includes(r.id))
  return NextResponse.json({ roles })
}
