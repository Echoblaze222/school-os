// src/app/dashboard/secretary/users/page.tsx
import { createServerClient } from '@supabase/ssr'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import SecretaryUsersClient from './SecretaryUsersClient'

export const metadata = { title: 'User Management — SchoolOS' }

export type UserRole = 'student' | 'teacher' | 'bursar' | 'secretary' | 'principal' | 'admin' | 'parent'

export interface ManagedUser {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: UserRole
  onboarding_stage: string
  is_active: boolean
  default_code: string | null
  created_at: string
  avatar_url: string | null
  last_sign_in: string | null
  student_number?: string | null
  class_name?: string | null
  subject?: string | null
  subjects?: string[]
  staff_id?: string | null
}

export default async function UsersPage() {
  // ── 1. Auth check with anon client (cookie-based session) ──────────────
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(c: any[]) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')
  if (!profile.school_id) {
    console.error('[users] secretary profile has no school_id — cannot load users')
    return (
      <SecretaryUsersClient
        users={[]}
        currentUserId={user.id}
      />
    )
  }

  // ── 2. Fetch all school users with service-role client ─────────────────
  // The anon client + RLS only allows a user to read their own profile row.
  // The secretary needs to see all profiles in their school, so we use the
  // service-role key here (same pattern as create-user route).
  const adminClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: users, error } = await adminClient
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      phone,
      role,
      onboarding_stage,
      is_active,
      default_code,
      created_at,
      avatar_url,
      last_sign_in
    `)
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })

  if (error) console.error('[users] fetch error:', error.message)

  return (
    <SecretaryUsersClient
      users={(users ?? []) as ManagedUser[]}
      currentUserId={user.id}
    />
  )
}
