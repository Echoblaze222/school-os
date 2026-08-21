import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CaseDetailClient from './CaseDetailClient'

export default async function CaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()

  const school = (profile as any)?.schools ?? null
  return <CaseDetailClient profile={profile} school={school} userId={user.id} caseId={caseId} />
}
