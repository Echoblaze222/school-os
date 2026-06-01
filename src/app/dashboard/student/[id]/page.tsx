// src/app/dashboard/student/quizzes/[id]/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import QuizTakeClient from './QuizTakeClient'

export const metadata = { title: 'Take Quiz — SchoolOS' }

export interface QuizQuestion {
  id: string
  quiz_id: string
  question_text: string
  options: string[]       // Array of 4 option strings
  correct_option: number  // 0-indexed
  order_index: number
  explanation?: string    // Optional explanation shown after submit
}

export interface QuizDetail {
  id: string
  title: string
  subject: string
  description: string | null
  duration_minutes: number
  scheduled_at: string
  status: string
  total_questions: number
}

export interface ExistingAttempt {
  id: string
  score: number
  total_questions: number
  answers: number[]       // student's chosen option index per question
  completed_at: string
  time_taken_seconds: number
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function QuizDetailPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) redirect('/login')

  // Parallel: quiz + questions + existing attempt
  const [quizRes, questionsRes, attemptRes] = await Promise.all([
    supabase
      .from('quizzes')
      .select('*')
      .eq('id', id)
      .single(),

    supabase
      .from('quiz_questions')
      .select('*')
      .eq('quiz_id', id)
      .order('order_index'),

    supabase
      .from('quiz_attempts')
      .select('*')
      .eq('quiz_id', id)
      .eq('student_id', user.id)
      .maybeSingle(),
  ])

  if (quizRes.error || !quizRes.data) notFound()
  if (questionsRes.error) console.error('[quiz-detail] questions error:', questionsRes.error.message)

  return (
    <QuizTakeClient
      quiz={quizRes.data as QuizDetail}
      questions={(questionsRes.data ?? []) as QuizQuestion[]}
      existingAttempt={attemptRes.data as ExistingAttempt | null}
      studentId={user.id}
    />
  )
}
