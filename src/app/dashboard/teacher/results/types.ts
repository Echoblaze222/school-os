export interface TeacherClass {
  class_subject_id: string
  class_id: string
  class_name: string
  subject_name: string
}

export interface StudentForResult {
  student_id: string
  full_name: string
  student_number: string | null
}

export interface ExistingResult {
  id: string
  student_id: string
  class_subject_id: string
  term: string
  result_type: string
  score: number
  max_score: number
  grade: string
  approved: boolean
}