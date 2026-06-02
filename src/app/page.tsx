import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()

  if (session) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', session.user.id).single()

    const routes: Record<string, string> = {
      student:   '/dashboard/student',
      teacher:   '/dashboard/teacher',
      principal: '/dashboard/principal',
      bursar:    '/dashboard/bursar',
      secretary: '/dashboard/secretary',
      parent:    '/dashboard/parent',
    }

    redirect(routes[profile?.role ?? ''] ?? '/login')
  }

  redirect('/select-school')
}

