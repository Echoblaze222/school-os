// src/app/dashboard/teacher/quizzes/page.tsx
// FIX: QuizzesClient uses useSearchParams() which requires <Suspense> in Next.js 15.
// Without Suspense, the component throws during SSR rendering, and Next.js
// falls through to the nearest error boundary — which in this app redirects to /login.
// Solution: wrap QuizzesClient in <Suspense> with a loading fallback.

import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QuizzesClient from './QuizzesClient'

function QuizzesLoading() {
  return (
    <div style={{
      minHeight: '100dvh',
      background: 'var(--bg-base)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 8, height: 8, borderRadius: '50%',
          background: 'var(--text-muted)',
          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
          display: 'block',
        }} />
      ))}
    </div>
  )
}

export default async function QuizzesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  const school = (profile as any)?.schools ?? null

  return (
    // FIX: Suspense is required because QuizzesClient calls useSearchParams()
    // Next.js 15 mandates this — without it the page crashes and falls to /login
    <Suspense fallback={<QuizzesLoading />}>
      <QuizzesClient profile={profile} school={school} userId={user.id} />
    </Suspense>
  )
}
