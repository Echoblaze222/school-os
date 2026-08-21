'use client'
// src/app/dashboard/examination/documents/DocumentsClient.tsx
// Custody status/current_custodian only ever change through
// /api/examination/documents/[id]/transfer-custody, see that route for
// why (no client UPDATE policy exists on purpose). Draft creation and
// reading are still normal client+RLS calls.

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { createClient } from '@/lib/supabase/client'
import motion from '@/components/dashboard-motion.module.css'

interface TimetableOption { id: string; exam_date: string; class_subjects?: { classes: { name: string }; subjects: { name: string } } | null }
interface DocumentRow {
  id: string; exam_timetable_id: string; doc_type: string; status: string
  current_custodian_id: string | null; created_by: string; created_at: string
  profiles?: { full_name: string } | null
  exam_timetable?: { exam_date: string; class_subjects?: { classes: { name: string }; subjects: { name: string } } | null } | null
}

interface Props {
  userId: string; profile: any; school: any; schoolId: string
  initialDocuments: DocumentRow[]; timetable: TimetableOption[]
  canCreate: boolean; canReview: boolean
}

const NEXT_STEP: Record<string, string> = {
  drafting: 'submitted', submitted: 'under_review', under_review: 'approved',
  approved: 'printed', printed: 'distributed', distributed: 'collected', collected: 'archived',
}
const NEXT_LABEL: Record<string, string> = {
  drafting: 'Submit for review', submitted: 'Mark under review', under_review: 'Approve',
  approved: 'Mark printed', printed: 'Mark distributed', distributed: 'Mark collected', collected: 'Archive',
}

export default function DocumentsClient({ userId, profile, school, schoolId, initialDocuments, timetable, canCreate, canReview }: Props) {
  const supabase = createClient()
  const [docs, setDocs] = useState(initialDocuments)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ exam_timetable_id: timetable[0]?.id ?? '', doc_type: 'question_paper' })
  const [saving, setSaving] = useState(false)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function createDraft(e: React.FormEvent) {
    e.preventDefault()
    if (saving || !form.exam_timetable_id) return
    setSaving(true)
    setError(null)
    const { data, error: insertError } = await supabase
      .from('exam_documents')
      .insert({ school_id: schoolId, exam_timetable_id: form.exam_timetable_id, doc_type: form.doc_type, created_by: userId, current_custodian_id: userId })
      .select('id, exam_timetable_id, doc_type, status, current_custodian_id, created_by, created_at, exam_timetable(exam_date, class_subjects(classes(name), subjects(name)))')
      .single()
    setSaving(false)
    if (insertError) {
      setError(`Couldn't start that document, ${insertError.message}.`)
      return
    }
    setDocs(prev => [{ ...(data as any), profiles: { full_name: profile?.full_name } }, ...prev])
    setShowForm(false)
  }

  async function advance(doc: DocumentRow) {
    const toStatus = NEXT_STEP[doc.status]
    if (!toStatus) return
    setMovingId(doc.id)
    setError(null)
    try {
      const res = await fetch(`/api/examination/documents/${doc.id}/transfer-custody`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toStatus }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) {
        setError(json.error ?? `Couldn't move this document (${res.status}). It's still at "${doc.status}", try again.`)
        return
      }
      setDocs(prev => prev.map(d => d.id === doc.id ? { ...d, status: json.status, current_custodian_id: json.custodianId } : d))
    } catch {
      setError('Network error while updating the document. It has not changed, check your connection and try again.')
    } finally {
      setMovingId(null)
    }
  }

  return (
    <RolePageWrapper userId={userId} role="examination" profile={profile} school={school} title="Question Papers">
      {error && (
        <div className="glass-card-flat" style={{ padding: 12, borderRadius: 'var(--radius-lg)', marginBottom: 12, border: '1px solid var(--danger)' }}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--danger)' }}>{error}</p>
        </div>
      )}

      {canCreate && timetable.length > 0 && (
        <button className="btn btn-primary" style={{ marginBottom: 16 }} onClick={() => setShowForm(s => !s)}>
          {showForm ? 'Cancel' : '+ Start a document'}
        </button>
      )}

      {showForm && (
        <form onSubmit={createDraft} className="glass-card" style={{ padding: 16, borderRadius: 'var(--radius-xl)', marginBottom: 16, display: 'grid', gap: 10 }}>
          <select value={form.exam_timetable_id} onChange={e => setForm(f => ({ ...f, exam_timetable_id: e.target.value }))} style={inputStyle}>
            {timetable.map(t => (
              <option key={t.id} value={t.id}>
                {t.exam_date} · {t.class_subjects?.subjects?.name ?? 'Subject'} · {t.class_subjects?.classes?.name ?? 'Class'}
              </option>
            ))}
          </select>
          <select value={form.doc_type} onChange={e => setForm(f => ({ ...f, doc_type: e.target.value }))} style={inputStyle}>
            <option value="question_paper">Question paper</option>
            <option value="marking_scheme">Marking scheme</option>
          </select>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Starting…' : 'Start draft'}</button>
        </form>
      )}

      {docs.length === 0 ? (
        <div className="glass-card-flat" style={{ padding: 20, borderRadius: 'var(--radius-xl)', textAlign: 'center' }}>
          <p style={{ margin: 0, opacity: 0.75 }}>No documents yet.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {docs.map(d => {
            const isOwner = d.created_by === userId
            const canAdvance = canReview || (isOwner && d.status === 'drafting')
            return (
              <div key={d.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-xl)' }}>
                <p style={{ margin: 0, fontWeight: 700, textTransform: 'capitalize' }}>{d.doc_type.replace('_', ' ')}</p>
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                  {d.exam_timetable?.exam_date} · {d.exam_timetable?.class_subjects?.subjects?.name}, {d.exam_timetable?.class_subjects?.classes?.name}
                </p>
                <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                  Status: <strong style={{ textTransform: 'capitalize' }}>{d.status.replace('_', ' ')}</strong>
                  {' '}· Currently with {d.profiles?.full_name ?? (d.current_custodian_id === userId ? 'you' : 'unknown')}
                </p>
                {canAdvance && NEXT_STEP[d.status] && (
                  <button className="btn" style={{ marginTop: 10, fontSize: 13 }} disabled={movingId === d.id} onClick={() => advance(d)}>
                    {movingId === d.id ? 'Updating…' : NEXT_LABEL[d.status]}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </RolePageWrapper>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'inherit', fontSize: 14, width: '100%',
}
