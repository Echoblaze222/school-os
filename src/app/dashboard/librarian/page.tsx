// src/app/dashboard/librarian/page.tsx
import { createClient }      from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect }          from 'next/navigation'
import { checkSubscription } from '@/lib/subscription'
import SubscriptionGate      from '@/components/SubscriptionGate'
import { hasActiveAppointment } from '@/lib/permissions'
import LibrarianDashboardClient from './LibrarianDashboardClient'

export default async function LibrarianDashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const sub = await checkSubscription(user.id)
  if (sub.locked) {
    return <SubscriptionGate schoolName={sub.schoolName} schoolColor={sub.schoolColor} status={sub.status as any} />
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile?.school_id) redirect('/login')

  const isLibrarian = await hasActiveAppointment(supabase, user.id, profile.school_id, 'librarian')
  if (!isLibrarian) redirect('/dashboard')

  const school   = (profile as any).schools ?? null
  const schoolId = profile.school_id
  const admin    = createAdminClient()

  const [
    { count: totalBooks },
    { count: openCheckouts },
    { count: overdueCheckouts },
    { data: recentCheckouts },
  ] = await Promise.all([
    admin.from('library_books').select('id', { count: 'exact', head: true }).eq('school_id', schoolId),
    admin.from('library_loans').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('returned_at', null),
    admin.from('library_loans').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).is('returned_at', null).lt('due_at', new Date().toISOString()),
    admin.from('library_loans')
      .select('id, borrowed_at, due_at, returned_at, book:library_books(title), borrower:profiles!library_loans_student_id_fkey(full_name)')
      .eq('school_id', schoolId)
      .order('borrowed_at', { ascending: false })
      .limit(5),
  ])

  const stats = {
    totalBooks: totalBooks ?? 0,
    openCheckouts: openCheckouts ?? 0,
    overdueCheckouts: overdueCheckouts ?? 0,
  }

  return (
    <LibrarianDashboardClient
      userId={user.id}
      librarianName={profile.full_name}
      school={school}
      stats={stats}
      recentCheckouts={recentCheckouts ?? []}
    />
  )
}
