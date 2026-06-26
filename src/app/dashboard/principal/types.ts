// src/app/dashboard/principal/types.ts

export interface PrincipalDashData {
  totalStudents: number
  totalTeachers: number
  feeRate: number
  pendingTransfers: number
  healthScore: {
    score: number
    recorded_at: string
    attendance_rate: number | null
    fee_rate: number | null
    results_rate: number | null
  } | null
  recentActivity: {
    id: string
    teacher_name: string
    action: string
    created_at: string
  }[]
}

export interface ResultRow {
  id:               string
  student_id:       string
  class_subject_id: string
  class_id:         string | null   // resolved from class_subjects.class_id
  term:             string           // enum: 'first' | 'second' | 'third'
  academic_year:    string
  result_type:      string           // enum: 'day_test' | 'mid_term' | 'exam'
  score:            number
  max_score:        number
  grade:            string
  remarks:          string | null
  posted_at:        string | null
  approved:         boolean
  approved_at:      string | null
  school_id:        string | null
  // Joined display fields (flattened in page.tsx)
  student_name:     string
  student_number:   string | null
  subject_name:     string
  subject_code:     string
  class_name:       string
  teacher_name:     string | null
}

export interface ClassOption {
  id:   string
  name: string
}

export interface StudentSearchResult {
  id: string
  full_name: string
  student_number: string | null
  class_id: string | null
  class_name: string | null
  school_id: string | null
  school_name: string | null
  outstanding_fees: number
  avg_score: number | null
  total_subjects: number
}

export interface PendingTransfer {
  id: string
  student_id: string
  student_name: string
  student_number: string | null
  origin_school_name: string | null
  destination_school_name: string | null
  status: string
  initiated_at: string
  notes: string | null
  avg_score: number | null
  total_results: number
}

export interface SchoolOption {
  id: string
  name: string
  address?: string | null
}

export interface PendingTransferRow {
  id: string
  student_id: string
  student_name: string
  student_number: string | null
  origin_school_name: string | null
  destination_school_name: string | null
  status: string
  initiated_at: string
  notes: string | null
  avg_score: number | null
  total_results: number
  outstanding_fees: number
  }
