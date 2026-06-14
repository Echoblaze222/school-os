import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import QuizTakeClient from './QuizTakeClient'
export default async function QuizPage({ params }: { params: Promise<{ id: string }> }) {
  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null
  const { id } = await params
  return <QuizTakeClient quizId={id} userId={user.id} profile={profile} school={school} />
}
