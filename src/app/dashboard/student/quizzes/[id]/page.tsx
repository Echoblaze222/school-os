import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QuizTakeClient from './QuizTakeClient'
export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase =await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school = (profile as any)?.schools ?? null
  const { id } = await params
  return <QuizTakeClient quizId={id} userId={session.user.id} profile={profile} school={school} />
}
