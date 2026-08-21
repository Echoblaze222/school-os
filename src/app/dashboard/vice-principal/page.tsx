// src/app/dashboard/vice-principal/page.tsx
// Vice Principal home. Gated on an active 'vice_principal' appointment,
// not on profiles.role (a VP's base role stays 'teacher' or 'principal' -
// see appointments-types.ts). See lib/permissions.ts requireAppointmentPage().

import { requireAppointmentPage } from '@/lib/permissions'
import { listDepartments, type DepartmentWithStats } from '@/lib/supabase/appointments'
import VicePrincipalDashboardClient from './VicePrincipalDashboardClient'

export default async function VicePrincipalDashboardPage() {
  const { supabase, ctx, appointment } = await requireAppointmentPage('vice_principal')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', ctx.userId).single()
  const school = (profile as any)?.schools ?? null

  const [
    { count: studentCount },
    { count: teacherCount },
    { count: classCount },
    { data: results },
    { data: notifRows },
    { count: unreadNotifCount },
    { data: activityRows },
    allDepartments,
  ] = await Promise.all([
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('school_id', ctx.schoolId).eq('role', 'student'),
    supabase.from('profiles').select('*', { count: 'exact', head: true })
      .eq('school_id', ctx.schoolId).eq('role', 'teacher'),
    supabase.from('classes').select('*', { count: 'exact', head: true })
      .eq('school_id', ctx.schoolId),
    supabase.from('results').select('score')
      .eq('school_id', ctx.schoolId).limit(200),
    supabase.from('notifications').select('id, title, body, type, created_at, action_url, link_url')
      .eq('user_id', ctx.userId).eq('is_read', false)
      .order('created_at', { ascending: false }).limit(3),
    supabase.from('notifications').select('*', { count: 'exact', head: true })
      .eq('user_id', ctx.userId).eq('is_read', false),
    supabase.from('recent_activities')
      .select('id, type, title, subtitle, href, metadata, created_at')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false }).limit(15),
    listDepartments(supabase, ctx.schoolId),
  ])

  const scores = (results ?? []).map((r: any) => r.score).filter((s: any) => s != null)
  const avgScore = scores.length
    ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length)
    : 0

  // "Your departments": the ones this VP's appointment scope actually
  // authorizes approve/publish/assign for. An empty scope isn't an error -
  // it just means the Principal hasn't configured it yet.
  const scope = (appointment.scope ?? {}) as { department_ids?: string[]; portfolio?: string }
  const scopedIds = new Set<string>([
    ...(appointment.department_id ? [appointment.department_id] : []),
    ...(Array.isArray(scope.department_ids) ? scope.department_ids : []),
  ])
  const myDepartments: DepartmentWithStats[] = allDepartments.filter(d => scopedIds.has(d.id))
  const departmentsMissingHod = myDepartments.filter(d => !d.hod).length

  const pendingNotifications = (notifRows ?? []).map((n: any) => ({
    id: n.id, title: n.title, body: n.body, type: n.type, created_at: n.created_at,
    href: n.action_url ?? n.link_url ?? '/dashboard/vice-principal/notifications',
  }))

  const activities = (activityRows ?? []).map((row: any) => ({
    id: row.id, type: row.type, title: row.title, subtitle: row.subtitle ?? undefined,
    href: row.href, created_at: row.created_at,
    preview: row.metadata ? { body: row.metadata.body, meta: row.metadata.meta } : undefined,
  }))

  return (
    <VicePrincipalDashboardClient
      profile={profile}
      school={school}
      userId={ctx.userId}
      portfolio={scope.portfolio ?? null}
      counts={{
        studentCount: studentCount ?? 0,
        teacherCount: teacherCount ?? 0,
        classCount: classCount ?? 0,
        avgScore,
        pendingActions: unreadNotifCount ?? 0,
        myDepartmentCount: myDepartments.length,
        departmentsMissingHod,
      }}
      myDepartments={myDepartments}
      activities={activities}
      pendingNotifications={pendingNotifications}
      unreadNotifCount={unreadNotifCount ?? 0}
    />
  )
}
