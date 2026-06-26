// src/app/dashboard/principal/results/page.tsx
//
// FIXED: results.student_id + results.posted_by have no named FK constraints
//        so Supabase can't join profiles inline — fetch students + teachers separately
// FIXED: class_id resolved from class_subjects join (results has no class_id column)
// FIXED: all display fields (student_name, subject_name, class_name, teacher_name)
//        flattened into ResultRow before passing to client

import { createClient }       from '@/lib/supabase/server'
import { redirect }           from 'next/navigation'
import PrincipalResultsClient from './PrincipalResultsClient'
import type { ResultRow, ClassOption } from '../types'

export default async function PrincipalResultsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'principal') redirect('/login')
  const schoolId = (profile as any).schools?.id ?? (profile as any).school_id ?? ''

  // ── 1. Raw results with class_subjects join only ───────────────────────────
  // We can't join profiles inline (no FK constraint on student_id / posted_by)
  // class_subjects join works because results_class_subject_id_fkey exists
  const { data: rawResults } = await supabase
    .from('results')
    .select(`
      id,
      student_id,
      posted_by,
      class_subject_id,
      term,
      academic_year,
      result_type,
      score,
      max_score,
      grade,
      remarks,
      posted_at,
      approved,
      approved_at,
      school_id,
      class_subjects (
        id,
        class_id,
        subjects ( id, name, code ),
        classes  ( id, name, class_level )
      )
    `)
    .eq('school_id', schoolId)
    .order('posted_at', { ascending: false })

  if (!rawResults || rawResults.length === 0) {
    const { data: classes } = await supabase
      .from('classes').select('id, name, class_level').eq('school_id', schoolId).order('class_level')
    return (
      <PrincipalResultsClient
        results={[]}
        classOptions={(classes ?? []).map((c: any) => ({ id: c.id, name: c.name ?? c.class_level }))}
        schoolId={schoolId}
      />
    )
  }

  // ── 2. Collect unique student_ids and posted_by ids ───────────────────────
  const studentIds = [...new Set(rawResults.map((r: any) => r.student_id).filter(Boolean))]
  const teacherIds = [...new Set(rawResults.map((r: any) => r.posted_by).filter(Boolean))]

  // ── 3. Fetch students ─────────────────────────────────────────────────────
  const { data: students } = await supabase
    .from('profiles')
    .select('id, full_name, student_number, default_code, admission_number')
    .in('id', studentIds)

  const studentMap: Record<string, any> = {}
  ;(students ?? []).forEach((s: any) => { studentMap[s.id] = s })

  // ── 4. Fetch teachers ─────────────────────────────────────────────────────
  const { data: teachers } = teacherIds.length > 0
    ? await supabase.from('profiles').select('id, full_name').in('id', teacherIds)
    : { data: [] }

  const teacherMap: Record<string, string> = {}
  ;(teachers ?? []).forEach((t: any) => { teacherMap[t.id] = t.full_name })

  // ── 5. Flatten into ResultRow ─────────────────────────────────────────────
  const results: ResultRow[] = rawResults.map((r: any) => {
    const cs   = Array.isArray(r.class_subjects) ? r.class_subjects[0] : r.class_subjects
    const subj = cs?.subjects ? (Array.isArray(cs.subjects) ? cs.subjects[0] : cs.subjects) : null
    const cls  = cs?.classes  ? (Array.isArray(cs.classes)  ? cs.classes[0]  : cs.classes)  : null
    const s    = studentMap[r.student_id]

    return {
      id:               r.id,
      student_id:       r.student_id,
      class_subject_id: r.class_subject_id,
      class_id:         cs?.class_id   ?? null,   // for classFilter in client
      term:             r.term,
      academic_year:    r.academic_year,
      result_type:      r.result_type,
      score:            r.score        ?? 0,
      max_score:        r.max_score    ?? 100,
      grade:            r.grade        ?? '—',
      remarks:          r.remarks,
      posted_at:        r.posted_at,
      approved:         r.approved     ?? false,
      approved_at:      r.approved_at,
      school_id:        r.school_id,
      student_name:     s?.full_name      ?? 'Unknown Student',
      student_number:   s?.student_number ?? s?.default_code ?? s?.admission_number ?? null,
      subject_name:     subj?.name        ?? '—',
      subject_code:     subj?.code        ?? '',
      class_name:       cls?.name         ?? cls?.class_level ?? '—',
      teacher_name:     r.posted_by ? (teacherMap[r.posted_by] ?? '—') : '—',
    }
  })

  // ── 6. Classes for filter dropdown ────────────────────────────────────────
  const { data: classes } = await supabase
    .from('classes')
    .select('id, name, class_level')
    .eq('school_id', schoolId)
    .order('class_level')

  const classOptions: ClassOption[] = (classes ?? []).map((c: any) => ({
    id:   c.id,
    name: c.name ?? c.class_level,
  }))

  return (
    <PrincipalResultsClient
      results={results}
      classOptions={classOptions}
      schoolId={schoolId}
    />
  )
    }
