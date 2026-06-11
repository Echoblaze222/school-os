// src/app/dashboard/secretary/users/page.tsx
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
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(list: { name: string; value: string; options: any }[]) {
          list.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // Own profile — RLS allows this
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  // School data for RolePageWrapper
  const { data: school } = await supabase
    .from('schools')
    .select('*')
    .eq('id', profile.school_id)
    .single()

  if (!profile.school_id) {
    console.error('[users] secretary has no school_id')
    return (
      <SecretaryUsersClient
        users={[] as ManagedUser[]}
        currentUserId={user.id}
        profile={profile}
        school={school}
      />
    )
  }

  // Service-role client bypasses RLS to read all school profiles
  const admin = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const { data: users, error } = await admin
    .from('profiles')
    .select('id, full_name, email, phone, role, onboarding_stage, is_active, default_code, created_at, avatar_url, last_sign_in')
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[users] fetch error:', error.message)
  } else {
    console.log('[users] fetched', users?.length, 'users for school', profile.school_id)
  }

  // Serialize explicitly to avoid Next.js serialization issues
  const safeUsers: ManagedUser[] = (users ?? []).map(u => ({
    id: u.id,
    full_name: u.full_name ?? '',
    email: u.email ?? '',
    phone: u.phone ?? null,
    role: u.role as UserRole,
    onboarding_stage: u.onboarding_stage ?? '',
    is_active: u.is_active ?? false,
    default_code: u.default_code ?? null,
    created_at: u.created_at ?? '',
    avatar_url: u.avatar_url ?? null,
    last_sign_in: u.last_sign_in ?? null,
  }))

  return (
    <SecretaryUsersClient
      users={safeUsers}
      currentUserId={user.id}
      profile={profile}
      school={school}
    />
  )
}
