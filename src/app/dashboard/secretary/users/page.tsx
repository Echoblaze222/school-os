// src/app/dashboard/secretary/users/page.tsx
import { createClient } from '@/lib/supabase/server'
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
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  const school = (profile as any).schools ?? null

  const { data: users, error } = await supabase
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
      profile={profile}
      school={school}
    />
  )
}
