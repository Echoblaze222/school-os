// src/app/dashboard/student/studentHomeSnapshot.ts
// What we keep on the phone for the student home screen. Deliberately small:
// just what the instant preview shows, nothing else from the profile.
// Bump SNAPSHOT_VERSION whenever the shape changes so old copies are ignored.

export const STUDENT_HOME_KEY = 'student-home'
export const SNAPSHOT_VERSION = 1

export interface StudentHomeCounts {
  pendingTasks: number
  upcomingQuizzes: number
  isLive: boolean
  notifications: number
  attendance: number | null
  gpa: number | null
  rank: number | null
}

export interface StudentHomeSnapshot {
  v: number
  firstName: string
  schoolName: string
  schoolColor: string
  counts: StudentHomeCounts
  activities: { id: string; title: string; subtitle?: string }[]
}
