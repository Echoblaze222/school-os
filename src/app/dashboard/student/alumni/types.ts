export interface AlumniProfile {
  full_name: string
  avatar_url: string | null
  class_name: string | null
  graduation_year: number | null
  admission_number: string | null
  lifecycle_stage: string | null
}

export interface AlumniResult {
  id: string
  subject: string
  class_name: string
  term: string
  academic_year: string
  score: number
  grade: string
}

export interface AlumniReceipt {
  id: string
  amount_ngn: number
  description: string
  paid_at: string
  receipt_number: string
  receipt_url: string | null
}