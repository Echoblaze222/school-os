// src/app/dashboard/secretary/users/page.tsx
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdmin } from '@supabase/supabase-js'
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
  admission_number?: string | null
  class_name?: string | null
  subject?: string | null
  subjects?: string[]
  staff_id?: string | null
}

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  const { data: school } = await supabase
    .from('schools')
    .select('*')
    .eq('id', profile.school_id)
    .single()

  // Use service role to bypass anon key restrictions
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: users, error } = await admin
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
      avatar_url
    `)
    .eq('school_id', profile.school_id)
    .order('created_at', { ascending: false })

  if (error) console.error('[users] fetch error:', error.message)

  // `last_sign_in` doesn't exist on `profiles` — it lives on Supabase Auth's
  // user records as `last_sign_in_at`. Pull it from there and merge it in.
  const lastSignInMap = new Map<string, string | null>()
  try {
    let page = 1
    const perPage = 1000
    // Safety cap so a runaway loop can't hammer the auth API
    while (page <= 10) {
      const { data: authPage, error: authErr } = await admin.auth.admin.listUsers({ page, perPage })
      if (authErr || !authPage) break
      for (const au of authPage.users) lastSignInMap.set(au.id, au.last_sign_in_at ?? null)
      if (authPage.users.length < perPage) break
      page++
    }
  } catch (e) {
    console.error('[users] auth listUsers error:', e)
  }

  const usersWithLastSignIn = (users ?? []).map(u => ({
    ...u,
    last_sign_in: lastSignInMap.get(u.id) ?? null,
  }))

  return (
    <SecretaryUsersClient
      users={usersWithLastSignIn as ManagedUser[]}
      currentUserId={user.id}
      profile={profile}
      school={school}
    />
  )
}
