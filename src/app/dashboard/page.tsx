// src/app/dashboard/page.tsx
// Role dispatcher - redirects each user to their own dashboard.
// The middleware protects this route, so by the time we get here
// there is always a valid session.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

const ROLE_ROUTES: Record<string, string> = {
  student:   '/dashboard/student',
  teacher:   '/dashboard/teacher',
  principal: '/dashboard/principal',
  bursar:    '/dashboard/bursar',
  secretary: '/dashboard/secretary',
  parent:    '/dashboard/parent',
  super_admin: '/admin',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, school_id')
    .eq('id', user.id)
    .single()

  // This identity was created through self-service signup (/join), not
  // an admin-issued access code, and has never been enrolled/employed by
  // a school. Sending them into /dashboard/parent or /dashboard/student
  // would be wrong - those pages assume a tenant member with real school
  // data. Applicants get their own area instead. If a school later admits
  // them, that's a separate, explicit staff action that sets school_id - // at which point this check naturally stops applying.
  if (profile && !profile.school_id) {
    redirect('/dashboard/applications')
  }

  const destination = ROLE_ROUTES[profile?.role ?? '']

  if (!destination) {
    // Role unknown or missing - bounce to login so they can re-authenticate
    redirect('/login')
  }

  redirect(destination)
}

