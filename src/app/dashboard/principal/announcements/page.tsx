// src/app/dashboard/principal/announcements/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AnnouncementsClient from './AnnouncementsClient'

export type AudienceType = 'all' | 'students' | 'teachers' | 'parents' | 'staff'

export interface AnnouncementRow {
  id: string
  title: string
  body: string
  audience: AudienceType
  class_id: string | null
  class_name: string | null
  created_at: string
  created_by_name: string | null
}

export interface ClassOption {
  id: string
  name: string
}

export default async function AnnouncementsPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, full_name, school_id, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || !['principal', 'admin'].includes(profile.role)) {
    redirect('/dashboard/student')
  }

  const school = (profile as any)?.schools ?? null
  const schoolId = profile.school_id ?? ''

  const [announcementsRes, classesRes] = await Promise.all([
    supabase
      .from('announcements')
      .select(`
        id,
        title,
        body,
        audience,
        target_class_id,
        created_at,
        classes:target_class_id ( name ),
        profiles:author_id ( full_name )
      `)
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false })
      .limit(50),

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
      creatorName={profile.full_name ?? 'Principal'}
      schoolId={schoolId}
      profile={profile}
      school={school}
      userId={user.id}
    />
  )
}
