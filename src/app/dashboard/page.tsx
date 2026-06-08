// src/app/dashboard/page.tsx
// Role dispatcher — redirects each user to their own dashboard.
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
  admin:     '/admin',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const destination = ROLE_ROUTES[profile?.role ?? '']

  if (!destination) {
    // Role unknown or missing — bounce to login so they can re-authenticate
    redirect('/login')
  }

  redirect(destination)
}
