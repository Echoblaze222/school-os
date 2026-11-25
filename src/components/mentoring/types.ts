// src/components/mentoring/types.ts
// Shared types + helpers for the Peer Mentoring feature (student + teacher pages).
// Rows come from the mentoring_* RPC views / tables in Supabase.

export const DAYS = [
  { key: 'mon', label: 'Mon' },
  { key: 'tue', label: 'Tue' },
  { key: 'wed', label: 'Wed' },
  { key: 'thu', label: 'Thu' },
  { key: 'fri', label: 'Fri' },
  { key: 'sat', label: 'Sat' },
  { key: 'sun', label: 'Sun' },
] as const

export const FALLBACK_LEVELS = ['Primary 6', 'JSS1', 'JSS2', 'JSS3', 'SSS1', 'SSS2', 'SSS3']

// Hard safety cap, mirrored in the database (mentors.max_mentees <= 3)
export const MAX_MENTEES = 3

export interface MentorRow {
  mentor_id: string
  student_id: string
  student_name: string | null
  student_level: string | null
  subject_id: string
  subject_name: string
  class_levels: string[]
  available_days: string[]
  available_note: string | null
  bio: string | null
  status: 'pending' | 'approved' | 'rejected' | 'suspended'
  review_note: string | null
  subject_avg: number | null
  active_mentees: number
  avg_rating: number | null
  sessions_done: number
  created_at: string
}

export interface PairingRow {
  pairing_id: string
  status: 'awaiting_teacher' | 'active' | 'rejected' | 'closed' | 'completed'
  subject_id: string
  subject_name: string
  topic: string | null
  mentor_id: string
  mentor_student_id: string
  mentor_name: string | null
  mentee_id: string
  mentee_name: string | null
  mentee_level: string | null
  chat_room_id: string | null
  grade_before: number | null
  grade_after: number | null
  session_count: number
  done_count: number
  avg_rating: number | null
  open_reports: number
  created_at: string
  reviewed_at: string | null
  my_role: 'mentor' | 'mentee' | 'staff'
}

export interface SessionRow {
  id: string
  pairing_id: string
  session_date: string
  goals: string | null
  notes: string | null
  status: 'scheduled' | 'done' | 'cancelled'
  completed_at: string | null
  rating: number | null
  rating_comment: string | null
}

export interface RequestRow {
  id: string
  subject_id: string
  topic: string
  preferred_day: string | null
  preferred_time: string | null
  status: 'pending' | 'matched' | 'done' | 'cancelled'
  created_at: string
}

export interface ReportRow {
  report_id: string
  pairing_id: string
  subject_name: string
  mentor_name: string | null
  mentee_name: string | null
  source: 'user' | 'auto'
  reason: string
  message_text: string | null
  sender_name: string | null
  status: 'open' | 'resolved'
  created_at: string
}

export function dayLabel(key: string | null | undefined): string {
  return DAYS.find(d => d.key === key)?.label ?? ''
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', {
    weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  })
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}

// <input type="datetime-local"> value for "tomorrow 4pm" style defaults
export function defaultSessionInput(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(16, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
