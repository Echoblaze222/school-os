// src/app/dashboard/secretary/notices/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnnouncementsClient from '@/app/dashboard/principal/announcements/AnnouncementsClient'
import type { AnnouncementRow, ClassOption } from '@/app/dashboard/principal/announcements/page'

export default async function SecretaryNoticesPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')

  const school   = (profile as any)?.schools ?? null
  const schoolId = profile.school_id as string

  const [announcementsRes, classesRes] = await Promise.all([
    supabase
      .from('announcements')
      .select(`
        id, title, body, audience, target_class_id, created_at,
        classes ( name ),
        profiles:created_by ( full_name )
      `)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(60),

    supabase
      .from('classes')
      .select('id, name')
      .eq('school_id', schoolId)
      .order('name'),
  ])

  const rows: AnnouncementRow[] = (announcementsRes.data ?? []).map((a: any) => ({
    id: a.id,
    title: a.title,
    body: a.body,
    audience: a.audience ?? 'all',
    class_id: a.target_class_id ?? null,
    class_name: a.classes?.name ?? null,
    created_at: a.created_at,
    created_by_name: a.profiles?.full_name ?? null,
  }))

  const classOptions: ClassOption[] = (classesRes.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
  }))

  return (
    <AnnouncementsClient
      announcements={rows}
      classOptions={classOptions}
      creatorId={user.id}
      creatorName={profile.full_name ?? 'Secretary'}
      schoolId={schoolId}
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
}