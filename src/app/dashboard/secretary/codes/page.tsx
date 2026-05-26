// src/app/dashboard/secretary/codes/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CodesClient from './CodesClient'

export interface ClassOption { id: string; name: string }

export default async function CodesPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,school_id').eq('id', user.id).single()
  if (!profile || !['secretary','admin','principal'].includes((profile as any).role)) redirect('/dashboard/student')
  const schoolId = (profile as any).school_id

  const { data: classes } = await supabase.from('classes').select('id,name').eq('school_id', schoolId).order('name')
  const classOptions: ClassOption[] = (classes??[]).map((c:any)=>({id:c.id,name:c.name}))

  return <CodesClient classOptions={classOptions} schoolId={schoolId} secretaryId={user.id} />
}
