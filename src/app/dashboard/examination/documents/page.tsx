// src/app/dashboard/examination/documents/page.tsx
import { getExamContext } from '@/lib/supabase/getExamContext'
import DocumentsClient from './DocumentsClient'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'

export default async function ExamDocumentsPage() {
  const { supabase, userId, profile, school, schoolId, can } = await getExamContext()

  const [{ data: documents }, { data: timetable }] = await Promise.all([
    supabase.from('exam_documents')
      .select('id, exam_timetable_id, doc_type, status, current_custodian_id, created_by, created_at, profiles!exam_documents_current_custodian_id_fkey(full_name), exam_timetable(exam_date, class_subjects(classes(name), subjects(name)))')
      .eq('school_id', schoolId)
      .order('created_at', { ascending: false }),
    supabase.from('exam_timetable')
      .select('id, exam_date, class_subjects(classes(name), subjects(name))')
      .eq('school_id', schoolId)
      .order('exam_date', { ascending: false })
      .limit(50),
  ])

  return (
    <DocumentsClient
      userId={userId}
      profile={profile}
      school={school}
      schoolId={schoolId}
      initialDocuments={(documents ?? []).map((d: any) => {
        const et = unwrapEmbed(d.exam_timetable)
        const cs = et ? unwrapEmbed(et.class_subjects) : null
        return {
          ...d,
          profiles: unwrapEmbed(d.profiles),
          exam_timetable: et ? { exam_date: et.exam_date, class_subjects: cs ? { classes: unwrapEmbed(cs.classes), subjects: unwrapEmbed(cs.subjects) } : null } : null,
        }
      })}
      timetable={(timetable ?? []).map((t: any) => {
        const cs = unwrapEmbed(t.class_subjects)
        return { ...t, class_subjects: cs ? { classes: unwrapEmbed(cs.classes), subjects: unwrapEmbed(cs.subjects) } : null }
      })}
      canCreate={can('create_documents')}
      canReview={can('review_documents')}
    />
  )
}
