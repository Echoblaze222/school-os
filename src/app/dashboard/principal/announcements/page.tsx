// src/app/dashboard/principal/announcements/page.tsx
// Server Component — fetches announcements + passes all required props

import { createClient } from '@/lib/supabase/server'
import { redirect }     from 'next/navigation'
import AnnouncementsClient, { Announcement } from './AnnouncementsClient'

export default async function PrincipalAnnouncementsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || !['principal', 'admin'].includes(profile.role)) {
    redirect('/dashboard/student')
  }

  const schoolId = profile.school_id as string

  // ── Fetch latest 60 announcements for this school ─────────
  const { data: rows } = await supabase
    .from('announcements')
    .select(`
      id, title, body, audience, priority,
      school_id, posted_by, created_at,
      poster:profiles!posted_by ( full_name )
    `)
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false })
    .limit(60)

  const items: Announcement[] = (rows ?? []).map((a: any) => ({
    id:         a.id,
    title:      a.title,
    body:       a.body,
    audience:   a.audience   ?? 'all',
    priority:   a.priority   ?? 'normal',
    school_id:  a.school_id,
    posted_by:  a.posted_by,
    created_at: a.created_at,
    poster_name: a.poster?.full_name ?? null,
  }))

  return (
    <AnnouncementsClient
      initialItems={items}
      userId={user.id}
      userName={profile.full_name ?? 'Principal'}
      schoolId={schoolId}
      role="principal"
    />
  )
}
