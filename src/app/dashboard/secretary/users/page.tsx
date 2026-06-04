// src/app/dashboard/secretary/users/page.tsx
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll() { return cookieStore.getAll() }, setAll(c: any[]) { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } } }
  )
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single()
  if (!profile || profile.role !== 'secretary') redirect('/login')
  const { data: school } = await supabase.from('schools').select('*').eq('id', profile.school_id).single()

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, email, role, is_active, default_code, created_at')
    .eq('school_id', profile.school_id)
    .neq('role', 'student')
    .order('created_at', { ascending: false })

  return <UsersClient users={users ?? []} profile={profile} school={school} userId={user.id} />
}
