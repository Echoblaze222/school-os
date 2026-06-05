// src/app/dashboard/teacher/announcements/page.tsx

import { createClient }        from '@/lib/supabase/server'
import { redirect }            from 'next/navigation'
import AnnouncementsClient, { Announcement } from '@/app/dashboard/principal/announcements/AnnouncementsClient'

export default async function TeacherAnnouncementsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'teacher') redirect('/login')

  const schoolId = profile.school_id as string

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
    id:          a.id,
    title:       a.title,
    body:        a.body,
    audience:    a.audience  ?? 'all',
    priority:    a.priority  ?? 'normal',
    school_id:   a.school_id,
    posted_by:   a.posted_by,
    created_at:  a.created_at,
    poster_name: a.poster?.full_name ?? null,
  }))

  return (
    <AnnouncementsClient
      initialItems={items}
      userId={user.id}
      userName={profile.full_name ?? 'Teacher'}
      schoolId={schoolId}
      role="teacher"
    />
  )
}