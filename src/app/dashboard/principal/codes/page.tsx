// src/app/dashboard/principal/codes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CodesClient from '@/app/dashboard/secretary/codes/CodesClient'
import type { ClassOption } from '@/app/dashboard/secretary/codes/page'

export const metadata = { title: 'Generate Access Codes — SchoolOS' }

export default async function PrincipalCodesPage() {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single()

  const schoolId = (profile as any)?.school_id ?? ''

  const { data: classes } = await supabase
    .from('classes')
    .select('id, name')
    .eq('school_id', schoolId)
    .order('name')

  const classOptions: ClassOption[] = (classes ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
  }))

  return (
    <CodesClient
      classOptions={classOptions}
      schoolId={schoolId}
      secretaryId={user.id}
      backHref="/dashboard/principal"
    />
  )
}