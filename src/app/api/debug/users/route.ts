// TEMPORARY — src/app/api/debug/users/route.ts
// Visit /api/debug/users while logged in as secretary
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  // Check env vars are present
  const envCheck = {
    SUPABASE_URL: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    ANON_KEY: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SERVICE_ROLE_KEY: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    SERVICE_ROLE_KEY_LENGTH: process.env.SUPABASE_SERVICE_ROLE_KEY?.length ?? 0,
  }

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
  if (!user) return NextResponse.json({ error: 'Not logged in', envCheck })

  const { data: profile } = await supabase
    .from('profiles').select('id, role, school_id').eq('id', user.id).single()

  // Try service role fetch
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: users, error: fetchError } = await admin
    .from('profiles')
    .select('id, full_name, email, role, school_id, is_active')
    .eq('school_id', profile?.school_id ?? '')
    .order('created_at', { ascending: false })

  // Also try serializing them like the page does
  const safeUsers = (users ?? []).map(u => ({
    id: u.id,
    full_name: u.full_name ?? '',
    email: u.email ?? '',
    role: u.role,
    school_id: u.school_id,
    is_active: u.is_active ?? false,
  }))

  return NextResponse.json({
    envCheck,
    profile,
    fetchError: fetchError?.message ?? null,
    rawCount: users?.length ?? 0,
    safeCount: safeUsers.length,
    safeUsers,
  })
}

