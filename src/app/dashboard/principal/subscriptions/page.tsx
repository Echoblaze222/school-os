// src/app/dashboard/principal/page.tsx
// BUG 7 FIX: Was passing no counts — all zeros on dashboard. Now fetches real data.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalDashboardClient from './PrincipalDashboardClient'
import { checkSubscription } from '@/lib/subscription'

export default async function PrincipalDashboardPage() {
  const supabase = await createClient()

  // BUG 7 FIX: use getUser() not deprecated getSession()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()

  if (!profile || profile.role !== 'principal') redirect('/login')

  // Defense-in-depth: middleware already redirects a hard-locked school to
  // /school-locked and a billing-locked one to /dashboard/principal/subscriptions
  // before this page even renders. This is a second layer in case that ever
  // gets bypassed (e.g. a middleware matcher change).
  const sub = await checkSubscription(user.id)
  if (sub.hardLocked) redirect('/school-locked?status=' + sub.status + '&role=principal')
  if (sub.status === 'expired' || sub.status === 'suspended') {
    redirect('/dashboard/principal/subscriptions?status=' + sub.status)
  }

  const school   = (profile as any)?.schools ?? null
  const schoolId = school?.id

  // BUG 7 FIX: fetch all counts in parallel
  const [
    { count: studentCount },
    { count: teacherCount },
    { count: classCount },
    { data: results },
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('role', 'student'),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId).eq('role', 'teacher'),
    supabase.from('classes').select('*', { count: 'exact', head: true })
      .eq('school_id', schoolId),
    supabase.from('results').select('score')
      .eq('school_id', schoolId).limit(200),
  ])

  const scores   = (results ?? []).map((r: any) => r.score).filter((s: any) => s != null)
  const avgScore = scores.length
    ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
    : 0

  // Health score: weighted from presence of students/teachers/classes + avg score
  const hasAll      = studentCount && teacherCount && classCount
  const healthScore = hasAll ? Math.min(100, 60 + Math.round((avgScore / 100) * 40)) : 30

  // ── Recent activities (last 15, most recent first) ─────────────────────────
  const { data: activityRows } = await supabase
    .from('recent_activities')
    .select('id, type, title, subtitle, href, metadata, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(15)

  const activities = (activityRows ?? []).map(row => ({
    id:         row.id,
    type:       row.type,
    title:      row.title,
    subtitle:   row.subtitle ?? undefined,
    href:       row.href,
    created_at: row.created_at,
    preview: row.metadata
      ? {
          body: row.metadata.body,
          meta: row.metadata.meta,
        }
      : undefined,
  }))

  return (
    <PrincipalDashboardClient
      profile={profile}
      school={school}
      userId={user.id}
      counts={{
        studentCount:   studentCount  ?? 0,
        teacherCount:   teacherCount  ?? 0,
        classCount:     classCount    ?? 0,
        avgScore,
        healthScore,
        pendingActions: 0,
      }}
      activities={activities}
    />
  )
}
