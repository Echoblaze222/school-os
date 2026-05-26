// src/app/dashboard/secretary/users/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UsersClient from './UsersClient'

export const metadata = { title: 'User Management — SchoolOS' }

export type UserRole = 'student' | 'teacher' | 'parent' | 'bursar' | 'principal' | 'secretary'

export interface ManagedUser {
  id: string              // auth user id
  full_name: string
  email: string
  phone: string | null
  role: UserRole
  onboarding_stage: string  // 'complete' | 'pending' | 'profile' | 'payment' etc.
  is_active: boolean
  default_code: string | null
  created_at: string
  avatar_url: string | null
  // role-specific
  class_name?: string       // students only
  subject?: string          // teachers only
  staff_id?: string         // staff only
}

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // Verify this user is secretary
  const { data: secProfile } = await supabase
    .from('staff_profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle()

  // Fetch all users from the unified user_profiles view / table
  // This table should have one row per user with role + onboarding info
  const { data: users, error } = await supabase
    .from('user_profiles')
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
      class_name,
      subject,
      staff_id
    `)
    .order('created_at', { ascending: false })

  if (error) console.error('[users] fetch error:', error.message)

  return (
    <UsersClient
      users={(users ?? []) as ManagedUser[]}
      secretaryId={user.id}
    />
  )
}
