import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QuizTakeClient from './QuizTakeClient'
export default async function QuizPage({ params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school = (profile as any)?.schools ?? null
  return <QuizTakeClient quizId={params.id} userId={session.user.id} profile={profile} school={school} />
}
