// src/app/dashboard/teacher/subscriptions/page.tsx
//
// Class teachers see which students in THEIR class have paid this term.
// Status only. The RPC restricts rows to classes where the caller is the
// class teacher, so subject-only teachers see nothing here.

import { redirect } from 'next/navigation'
import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import StaffSubscriptionStatus, { type StaffStatusStudent } from '@/components/subscription/StaffSubscriptionStatus'

export default async function TeacherSubscriptionsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data } = await supabase.rpc('subscription_status_for_staff')
  const result = (data ?? {}) as {
    term?: { name: string; grace_ends_on: string } | null
    students?: StaffStatusStudent[]
  }

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px' }}>
      <h1 style={{ fontSize: '1.4rem', margin: '0 0 6px' }}>Class subscription status</h1>
      <p style={{ opacity: 0.7, fontSize: '0.9rem', margin: '0 0 20px' }}>
        Who has paid this term in the class you teach.
      </p>
      <StaffSubscriptionStatus
        termName={result.term?.name ?? null}
        graceEndsOn={result.term?.grace_ends_on ?? null}
        students={result.students ?? []}
      />
    </main>
  )
}
