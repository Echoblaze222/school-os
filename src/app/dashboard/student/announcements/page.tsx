// src/app/dashboard/student/announcements/page.tsx
// Server Component — student reads announcements (no write access)

import { createClient }       from '@/lib/supabase/server'
import { redirect }           from 'next/navigation'
import AnnouncementsViewer    from '@/components/AnnouncementsViewer'
import DashboardHeader        from '@/components/DashboardHeader'
import StudentNav             from '@/components/StudentNav'

export default async function StudentAnnouncementsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'student') redirect('/login')

  const schoolId = profile.school_id as string
  const schoolColor = '#800020' // or fetch from schools table

  // Fetch announcements for students (audience = 'all' OR 'students')
  const { data: rows } = await supabase
    .from('announcements')
    .select(`
      id, title, body, audience, priority, created_at,
      poster:profiles!posted_by ( full_name )
    `)
    .eq('school_id', schoolId)
    .in('audience', ['all', 'students'])
    .order('created_at', { ascending: false })
    .limit(40)

  const items = (rows ?? []).map((a: any) => ({
    id:          a.id,
    title:       a.title,
    body:        a.body,
    audience:    a.audience  ?? 'all',
    priority:    a.priority  ?? 'normal',
    created_at:  a.created_at,
    poster_name: a.poster?.full_name ?? null,
  }))

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)' }}>
      <StudentNav userId={user.id} profile={profile} school={{ primary_color: schoolColor }} schoolColor={schoolColor} />
      <div style={{ paddingTop: 'var(--space-5)' }}>
        <DashboardHeader
          userId={user.id}
          role="student"
          profile={profile}
          school={{ primary_color: schoolColor }}
          schoolColor={schoolColor}
          title="Notice Board"
          showBack
        />
        <AnnouncementsViewer
          initialItems={items}
          schoolId={schoolId}
          viewerAudience="students"
        />
        <div style={{ height: 100 }} />
      </div>
    </div>
  )
}
