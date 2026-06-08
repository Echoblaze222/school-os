// src/app/dashboard/teacher/audit/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AuditClient from './AuditClient'

export const metadata = { title: 'Audit Log — SchoolOS' }

export interface AuditEntry {
  id: string
  action: string
  details: string | null
  logged_at: string
  actor_name: string
  actor_role: string
}

const PAGE_SIZE = 50

interface PageParams {
  searchParams: Promise<{
    page?: string
    action?: string
    user?: string
    from?: string
    to?: string
  }>
}

export default async function AuditPage({ searchParams }: PageParams) {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  // Load profile + school for RolePageWrapper
  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()
  const school = (profile as any)?.schools ?? null

  const params      = await searchParams
  const page        = Math.max(0, parseInt(params.page ?? '0', 10))
  const action      = params.action ?? ''
  const userFilter  = params.user ?? ''
  const from        = params.from ?? ''
  const to          = params.to ?? ''

  // Scope audit log to this school's users only (teacher sees their school's activity)
  let query = supabase
    .from('portal_audit_log')
    .select('id, action, details, logged_at, profiles!actor_id(full_name, role, school_id)', { count: 'exact' })
    .order('logged_at', { ascending: false })

  if (action)     query = query.eq('action', action)
  if (from)       query = query.gte('logged_at', from + 'T00:00:00')
  if (to)         query = query.lte('logged_at', to   + 'T23:59:59')

  const { data, error, count } = await query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)
  if (error) console.error('[audit] fetch error:', error.message)

  // Filter by school + optionally by user name
  const schoolId = school?.id
  const rawRows = (data ?? []).filter((r: any) => {
    const rowSchool = r.profiles?.school_id
    if (schoolId && rowSchool && rowSchool !== schoolId) return false
    if (userFilter && !r.profiles?.full_name?.toLowerCase().includes(userFilter.toLowerCase())) return false
    return true
  })

  const { data: actionsData } = await supabase
    .from('portal_audit_log')
    .select('action')
    .order('action')
  const actionTypes = Array.from(new Set((actionsData ?? []).map((r: any) => r.action).filter(Boolean)))

  const entries: AuditEntry[] = rawRows.map((r: any) => ({
    id:         r.id ?? crypto.randomUUID(),
    action:     r.action ?? '—',
    details:    r.details ?? null,
    logged_at:  r.logged_at,
    actor_name: r.profiles?.full_name ?? 'Unknown',
    actor_role: r.profiles?.role ?? '—',
  }))

  return (
    <AuditClient
      entries={entries}
      totalCount={count ?? 0}
      page={page}
      actionTypes={actionTypes}
      filters={{ action, user: userFilter, from, to }}
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
}
