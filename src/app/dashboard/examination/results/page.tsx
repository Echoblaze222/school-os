// src/app/dashboard/examination/results/page.tsx
//
// NOTE: results.student_id has no named FK constraint (same gap already
// documented in principal/results/page.tsx), profiles can't be joined
// inline through PostgREST, so student names are fetched separately and
// merged. Keeping the fetch shape consistent with how the existing
// Principal/Teacher results pages already work around this.

import { getExamContext } from '@/lib/supabase/getExamContext'
import ResultsWorkflowClient from './ResultsWorkflowClient'

type RawResultRow = {
  id: string; student_id: string; term: string; academic_year: string; result_type: string
  score: number | null; max_score: number; grade: string | null
  approved_at?: string | null; verified_at?: string | null
  class_subjects: { classes: { name: string } | { name: string }[]; subjects: { name: string } | { name: string }[] } | null
}

function flatten(row: RawResultRow, studentName: string) {
  const cs = row.class_subjects
  const cls = cs ? (Array.isArray(cs.classes) ? cs.classes[0] : cs.classes) : null
  const subj = cs ? (Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects) : null
  return {
    id: row.id, term: row.term, academic_year: row.academic_year, result_type: row.result_type,
    score: row.score, max_score: row.max_score, grade: row.grade,
    approved_at: row.approved_at, verified_at: row.verified_at,
    student_name: studentName, class_name: cls?.name ?? 'Class', subject_name: subj?.name ?? 'Subject',
  }
}

export default async function ExamResultsWorkflowPage() {
  const { supabase, userId, profile, school, schoolId, can } = await getExamContext()

  const [{ data: rawVerification }, { data: rawPublication }] = await Promise.all([
    can('verify_results')
      ? supabase.from('results')
          .select('id, student_id, term, academic_year, result_type, score, max_score, grade, approved_at, class_subjects(classes(name), subjects(name))')
          .eq('school_id', schoolId).eq('approved', true).eq('verified', false)
          .order('approved_at', { ascending: true }).limit(200)
      : Promise.resolve({ data: [] as RawResultRow[] }),
    can('publish_results')
      ? supabase.from('results')
          .select('id, student_id, term, academic_year, result_type, score, max_score, grade, verified_at, class_subjects(classes(name), subjects(name))')
          .eq('school_id', schoolId).eq('verified', true).eq('published', false)
          .order('verified_at', { ascending: true }).limit(200)
      : Promise.resolve({ data: [] as RawResultRow[] }),
  ])

  const allRows = [...(rawVerification ?? []), ...(rawPublication ?? [])] as RawResultRow[]
  const studentIds = [...new Set(allRows.map(r => r.student_id))]
  const { data: students } = studentIds.length
    ? await supabase.from('profiles').select('id, full_name').in('id', studentIds)
    : { data: [] }
  const nameById: Record<string, string> = {}
  for (const s of students ?? []) nameById[(s as any).id] = (s as any).full_name ?? 'Student'

  return (
    <ResultsWorkflowClient
      userId={userId}
      profile={profile}
      school={school}
      initialAwaitingVerification={((rawVerification ?? []) as unknown as RawResultRow[]).map((r) => flatten(r, nameById[r.student_id]))}
      initialAwaitingPublication={((rawPublication ?? []) as unknown as RawResultRow[]).map((r) => flatten(r, nameById[r.student_id]))}
      canVerify={can('verify_results')}
      canPublish={can('publish_results')}
    />
  )
}
