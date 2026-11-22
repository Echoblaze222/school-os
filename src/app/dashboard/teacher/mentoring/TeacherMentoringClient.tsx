'use client'
// src/app/dashboard/teacher/mentoring/TeacherMentoringClient.tsx
import StaffMentoringClient from '@/components/mentoring/StaffMentoringClient'
import { TEACHER_FEATURE_GROUPS } from '../featureGroups'

export default function TeacherMentoringClient(props: { profile: any; school: any; userId: string }) {
  return (
    <StaffMentoringClient {...props} role="teacher"
      featureGroups={TEACHER_FEATURE_GROUPS} chatBase="/dashboard/teacher/chat" />
  )
}
