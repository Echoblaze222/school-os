// src/app/dashboard/principal/codes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CodesClient from '@/app/dashboard/secretary/codes/CodesClient'
import type { GeneratedCode } from '@/app/dashboard/secretary/codes/page'

export const metadata = { title: 'Generate Access Codes — SchoolOS' }

export default async function PrincipalCodesPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const [schoolRes, historyRes] = await Promise.all([
    supabase.from('school_settings').select('school_name, school_slug, school_id').maybeSingle(),
    supabase
      .from('access_codes')
      .select('id, code, role, full_name, used, created_at')
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const schoolSlug = schoolRes.data?.school_slug
    ?? (schoolRes.data?.school_name ?? 'SCH').slice(0, 3).toUpperCase()

  return (
    <CodesClient
      role="principal"
      schoolSlug={schoolSlug}
      schoolId={schoolRes.data?.school_id ?? ''}
      creatorId={user.id}
      history={(historyRes.data ?? []).map((r: any) => ({ ...r, school_slug: schoolSlug })) as GeneratedCode[]}
    />
  )
}
