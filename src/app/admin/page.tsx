// src/app/admin/page.tsx
// THE SCHOOLOS PLATFORM ADMIN PANEL
// Only YOU (the platform owner) can access this.
// Protected by PLATFORM_ADMIN_SECRET in env.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AdminClient from './AdminClient'

export default async function AdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Check if this user is the platform admin
  // Add your email to PLATFORM_ADMIN_EMAIL in .env.local
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL
  if (!adminEmail || user.email !== adminEmail) {
    redirect('/')
  }

  // Get platform-wide stats
  const [
    { count: totalSchools },
    { count: activeSchools },
    { count: totalUsers },
    { count: totalStudents },
    { data: recentSchools },
    { data: subscriptions },
    { data: recentPayments },
  ] = await Promise.all([
    supabase.from('schools').select('*', { count: 'exact', head: true }),
    supabase.from('schools').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('profiles').select('*', { count: 'exact', head: true }),
    supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'student'),
    supabase.from('schools').select('id, name, city, state, status, created_at, is_platform_active').order('created_at', { ascending: false }).limit(10),
    supabase.from('subscriptions').select('plan_type, status, amount_paid, currency_used, school_registry_id, schools!school_registry_id(name)').order('started_at', { ascending: false }).limit(20),
    supabase.from('payments').select('amount_paid_ngn, paid_at, schools!school_id(name)').order('paid_at', { ascending: false }).limit(10),
  ])

  // Calculate total platform revenue
  const totalRevenue = subscriptions?.reduce((s, sub) => s + (sub.amount_paid || 0), 0) ?? 0

  return (
    <AdminClient
      stats={{
        totalSchools:  totalSchools  ?? 0,
        activeSchools: activeSchools ?? 0,
        totalUsers:    totalUsers    ?? 0,
        totalStudents: totalStudents ?? 0,
        totalRevenue,
      }}
      recentSchools={recentSchools ?? []}
      subscriptions={subscriptions ?? []}
      recentPayments={recentPayments ?? []}
      adminEmail={user.email ?? ''}
    />
  )
}
