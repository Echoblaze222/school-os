// src/app/dashboard/teacher/homeProps.ts
// What the teacher Home screen needs to be shown offline. Counts and a label only:
// nothing sensitive (see src/lib/offline/homeProps.ts). Shared by the online page,
// which saves it, and the offline twin, which reads it.

export interface TeacherHomeProps {
  counts: {
    classCount: number
    studentCount: number
    assignmentCount: number
    pendingGrading: number
    quizCount: number
  }
  examAppointmentLabel: string | null
}
