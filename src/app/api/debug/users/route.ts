// TEMPORARY DEBUG — src/app/api/debug/users/route.ts
// Add this file, deploy, visit /api/debug/users, then DELETE it after fixing.

import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list: any[]) { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not logged in' })

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, school_id')
    .eq('id', user.id)
    .single()

  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Count ALL profiles (no filter) via service role
  const { count: totalCount } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  // Count profiles with this school_id
  const { count: schoolCount } = await admin
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('school_id', profile?.school_id ?? '')

  // Sample 5 profiles with their school_ids
  const { data: sample } = await admin
    .from('profiles')
    .select('id, full_name, role, school_id')
    .limit(5)

  return NextResponse.json({
    currentUser: { id: user.id, role: profile?.role, school_id: profile?.school_id },
    totalProfilesInDB: totalCount,
    profilesMatchingSchoolId: schoolCount,
    sampleProfiles: sample,
  })
}
