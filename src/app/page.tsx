import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: profile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single()
    const routes: Record<string, string> = {
      student: '/dashboard/student', teacher: '/dashboard/teacher',
      principal: '/dashboard/principal', bursar: '/dashboard/bursar',
      secretary: '/dashboard/secretary', parent: '/dashboard/parent',
      admin: '/admin',
    }
    redirect(routes[profile?.role ?? ''] ?? '/login')
  }
  redirect('/login')
}
