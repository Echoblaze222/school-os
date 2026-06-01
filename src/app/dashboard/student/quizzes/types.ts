export interface QuizSummary {
  id: string
  title: string
  description: string | null
  subject_name: string | null
  class_id: string | null
  duration_minutes: number | null
  total_marks: number
  starts_at: string
  ends_at: string
  status: 'live' | 'upcoming' | 'ended'
  attempted: boolean
  prior_score: number | null
  prior_total: number | null
}