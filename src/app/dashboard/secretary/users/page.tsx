// src/app/dashboard/secretary/users/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import UsersClient from './UsersClient'

export const metadata = { title: 'User Management — SchoolOS' }

export type UserRole = 'student' | 'teacher' | 'bursar' | 'secretary' | 'principal' | 'admin' | 'parent'

export interface ClassOption {   // 👈 add this
  id: string
  name: string
}

export interface ManagedUser {
  // ... rest unchanged
}
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
  subjects?: string[]        // 👈 add this
  staff_id?: string | null
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
  last_sign_in,
  student_number,
  class_name,
  subject,
  subjects,
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
