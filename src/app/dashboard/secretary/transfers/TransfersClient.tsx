'use client'
// src/app/dashboard/secretary/transfers/TransfersClient.tsx
//
// Consolidates the old Admissions + Applications pages into one feature that
// plugs into the existing inter-school `student_transfers` system already used
// by principals. A secretary initiates an outgoing transfer for one of their
// own students to another SchoolOS school; the destination school's principal
// approves/rejects it from their existing "Pending Transfers" page. This page
// also shows transfers this school has received, for visibility — approval
// for those still happens on the principal side, by design.

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'
import tStyles from './transfer.module.css'

type TransferStatus = 'requested' | 'approved' | 'rejected' | 'completed'

interface TransferRow {
  id: string
  student_id: string
  status: TransferStatus
  requested_at: string
  approved_at: string | null
  completed_at: string | null
  rejection_reason: string | null
  has_outstanding_fees: boolean
  outstanding_amount: number | null
  debt_acknowledged: boolean
  from_class: string | null
  to_class: string | null
  origin_school_id: string
  destination_school_id: string
}

interface StudentLite { id: string; full_name: string; admission_number: string | null }
interface SchoolLite { id: string; name: string; city: string | null }
interface SearchStudent { id: string; full_name: string; admission_number: string; class_label: string; outstanding_fees: number }
interface SearchSchool { id: string; name: string; city: string }

interface Props {
  sent: TransferRow[]
  received: TransferRow[]
  studentProfiles: StudentLite[]
  schools: SchoolLite[]
  profile: any
  school: any
  userId: string
}

const STATUS_COLORS: Record<TransferStatus, string> = {
  requested: '#F59E0B', approved: '#3B82F6', completed: '#10B981', rejected: '#EF4444',
}

export default function TransfersClient({ sent: initSent, received: initReceived, studentProfiles, schools, profile, school, userId }: Props) {
  const [sent, setSent]         = useState(initSent)
  const [received]              = useState(initReceived)
  const [extraSchools, setExtraSchools] = useState<SchoolLite[]>([]) // schools learned about client-side (e.g. just-created transfer's destination)
  const [direction, setDirection] = useState<'sent' | 'received'>('sent')
  const [statusTab, setStatusTab] = useState<'all' | TransferStatus>('all')
  const [viewItem, setViewItem] = useState<(TransferRow & { direction: 'sent' | 'received' }) | null>(null)
  const [modal, setModal]       = useState(false)

  // New-transfer flow state
  const [studentSearch, setStudentSearch]   = useState('')
  const [studentResults, setStudentResults] = useState<SearchStudent[]>([])
  const [selectedStudent, setSelectedStudent] = useState<SearchStudent | null>(null)
  const [schoolSearch, setSchoolSearch]     = useState('')
  const [schoolResults, setSchoolResults]   = useState<SearchSchool[]>([])
  const [selectedSchool, setSelectedSchool] = useState<SearchSchool | null>(null)
  const [acknowledged, setAcknowledged]     = useState(false)
  const [submitting, setSubmitting]         = useState(false)
  const [success, setSuccess]               = useState(false)
  const [error, setError]                   = useState<string | null>(null)

  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  const studentMap = useMemo(() => {
    const m = new Map<string, StudentLite>()
    for (const s of studentProfiles) m.set(s.id, s)
    return m
  }, [studentProfiles])

  const schoolMap = useMemo(() => {
    const m = new Map<string, SchoolLite>()
    for (const s of [...schools, ...extraSchools]) m.set(s.id, s)
    return m
  }, [schools, extraSchools])

  function studentName(id: string) { return studentMap.get(id)?.full_name ?? 'Unknown student' }
  function schoolName(id: string) { return schoolMap.get(id)?.name ?? 'Unknown school' }

  const rows: Array<TransferRow & { direction: 'sent' | 'received' }> = direction === 'sent'
    ? sent.map(t => ({ ...t, direction: 'sent' as const }))
    : received.map(t => ({ ...t, direction: 'received' as const }))

  const filtered = rows.filter(r => statusTab === 'all' || r.status === statusTab)

  async function searchStudents() {
    if (!studentSearch.trim()) return
    const { data } = await supabase
      .from('profiles')
      .select(`id, full_name, school_id, student_profiles ( admission_number, classes ( level, section ) )`)
      .eq('role', 'student')
      .eq('school_id', profile.school_id) // scoped to this secretary's own school
      .ilike('full_name', `%${studentSearch}%`)
      .limit(10)

    const results: SearchStudent[] = []
    for (const p of data ?? []) {
      const sp = (p as any).student_profiles
      const { data: inv } = await supabase
        .from('payment_invoices')
        .select('balance_ngn')
        .eq('student_id', p.id)
        .in('status', ['pending', 'partial', 'overdue'])
      const fees = (inv ?? []).reduce((s: number, i: any) => s + (i.balance_ngn ?? 0), 0)
      results.push({
        id: p.id, full_name: p.full_name,
        admission_number: sp?.admission_number ?? '—',
        class_label: sp?.classes ? `${sp.classes.level}${sp.classes.section}` : '—',
        outstanding_fees: fees,
      })
    }
    setStudentResults(results)
  }

  async function searchSchools() {
    if (!schoolSearch.trim()) return
    const { data } = await supabase
      .from('schools')
      .select('id, name, city')
      .ilike('name', `%${schoolSearch}%`)
      .eq('status', 'active')
      .neq('id', profile.school_id)
      .limit(10)
    setSchoolResults(data ?? [])
  }

  async function submitTransfer() {
    if (!selectedStudent || !selectedSchool) return
    setSubmitting(true); setError(null)

    const { data, error: err } = await supabase.from('student_transfers').insert({
      student_id:            selectedStudent.id,
      origin_school_id:      profile.school_id,
      destination_school_id: selectedSchool.id,
      initiated_by:          userId,
      status:                'requested',
      debt_acknowledged:     acknowledged,
      has_outstanding_fees:  selectedStudent.outstanding_fees > 0,
      outstanding_amount:    selectedStudent.outstanding_fees,
    }).select(`id, student_id, status, requested_at, approved_at, completed_at, rejection_reason, has_outstanding_fees, outstanding_amount, debt_acknowledged, from_class, to_class, origin_school_id, destination_school_id`).single()

    if (err) { setError(err.message) }
    else {
      setSent(p => [data as any, ...p])
      setExtraSchools(p => [...p, { id: selectedSchool.id, name: selectedSchool.name, city: selectedSchool.city }])
      setSuccess(true)
    }
    setSubmitting(false)
  }

  function resetModal() {
    setModal(false); setSuccess(false); setError(null)
    setStudentSearch(''); setStudentResults([]); setSelectedStudent(null)
    setSchoolSearch(''); setSchoolResults([]); setSelectedSchool(null)
    setAcknowledged(false)
  }

  const hasDebt = (selectedStudent?.outstanding_fees ?? 0) > 0
  function fmtDate(d: string | null) { return d ? new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }) : '—' }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Transfers">
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', marginBottom: 'var(--space-4)' }}>
        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
          {(['sent', 'received'] as const).map(d => (
            <button key={d} onClick={() => { setDirection(d); setStatusTab('all') }}
              style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                background: direction === d ? sc + '22' : 'var(--glass-bg)', borderColor: direction === d ? sc : 'var(--glass-border)', color: direction === d ? sc : 'var(--text-muted)' }}>
              {d === 'sent' ? `Sent (${sent.length})` : `Received (${received.length})`}
            </button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button className={styles.btnPrimary} onClick={() => setModal(true)} style={{ height: 40, padding: '0 var(--space-4)', whiteSpace: 'nowrap' }}>+ New Transfer</button>
      </div>

      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
        {(['all', 'requested', 'approved', 'completed', 'rejected'] as const).map(t => {
          const count = t === 'all' ? rows.length : rows.filter(r => r.status === t).length
          const color = t === 'all' ? sc : STATUS_COLORS[t]
          return (
            <button key={t} onClick={() => setStatusTab(t)}
              style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                background: statusTab === t ? color + '22' : 'var(--glass-bg)', borderColor: statusTab === t ? color : 'var(--glass-border)', color: statusTab === t ? color : 'var(--text-muted)' }}>
              {t.charAt(0).toUpperCase() + t.slice(1)} ({count})
            </button>
          )
        })}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyEmoji}>✈️</p>
          <p className={styles.emptyTitle}>No {direction} transfers</p>
          <p className={styles.emptyHint}>{direction === 'sent' ? 'Transfers you initiate for students leaving this school appear here' : 'Transfer requests from other schools for this school appear here'}</p>
        </div>
      ) : (
        filtered.map(r => (
          <div key={r.id} className={styles.listItem} onClick={() => setViewItem(r)}>
            <div className={styles.listIconBox} style={{ background: STATUS_COLORS[r.status] + '22' }}><span style={{ fontSize: '1.1rem' }}>✈️</span></div>
            <div className={styles.listContent}>
              <p className={styles.listTitle}>{studentName(r.student_id)}</p>
              <p className={styles.listSub}>
                {r.direction === 'sent' ? `→ ${schoolName(r.destination_school_id)}` : `← ${schoolName(r.origin_school_id)}`} · {fmtDate(r.requested_at)}
              </p>
            </div>
            <span className={styles.listBadge} style={{ background: STATUS_COLORS[r.status] + '22', color: STATUS_COLORS[r.status], textTransform: 'capitalize' }}>{r.status}</span>
          </div>
        ))
      )}

      {viewItem && (
        <div className={styles.modalOverlay} onClick={() => setViewItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{studentName(viewItem.student_id)}</h2>
            {[
              [viewItem.direction === 'sent' ? 'Destination' : 'Origin', schoolName(viewItem.direction === 'sent' ? viewItem.destination_school_id : viewItem.origin_school_id)],
              ['Status', viewItem.status],
              ['Requested', fmtDate(viewItem.requested_at)],
              ['Approved', fmtDate(viewItem.approved_at)],
              ['Completed', fmtDate(viewItem.completed_at)],
              ['Outstanding fees', viewItem.has_outstanding_fees ? `₦${(viewItem.outstanding_amount ?? 0).toLocaleString()}` : 'None'],
            ].map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontWeight: 600, color: 'var(--text-primary)', textTransform: l === 'Status' ? 'capitalize' : 'none' }}>{v}</span>
              </div>
            ))}
            {viewItem.status === 'rejected' && viewItem.rejection_reason && (
              <p style={{ fontSize: '0.8rem', color: '#EF4444', marginTop: 'var(--space-3)' }}>Reason: {viewItem.rejection_reason}</p>
            )}
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 'var(--space-4)', lineHeight: 1.5 }}>
              {viewItem.direction === 'sent'
                ? 'The destination school\u2019s principal approves or rejects this request.'
                : 'This school\u2019s principal reviews this request from the Pending Transfers page.'}
            </p>
          </div>
        </div>
      )}

      {modal && (
        <div className={styles.modalOverlay} onClick={resetModal}>
          <div className={tStyles.card} onClick={e => e.stopPropagation()} style={{ maxWidth: 440, margin: '5vh auto', maxHeight: '88vh', overflowY: 'auto' }}>
            {success ? (
              <div className={tStyles.successBox}>
                <p className={tStyles.successIcon}>✈️</p>
                <p className={tStyles.successTitle}>Transfer Initiated</p>
                <p className={tStyles.successSub}>The Principal of <strong>{selectedSchool?.name}</strong> has been notified and will review this request.</p>
                <button className={tStyles.resetBtn} onClick={resetModal}>Done</button>
              </div>
            ) : (
              <>
                <h2 className={styles.modalTitle}>New Transfer</h2>
                <div className={tStyles.searchRow}>
                  <input className={tStyles.input} placeholder="Search student by name…" value={studentSearch} onChange={e => setStudentSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchStudents()} />
                  <button className={tStyles.searchBtn} onClick={searchStudents}>Search</button>
                </div>
                {studentResults.map(s => (
                  <button key={s.id} className={`${tStyles.resultRow} ${selectedStudent?.id === s.id ? tStyles.resultRowActive : ''}`} onClick={() => setSelectedStudent(s)}>
                    <div><p className={tStyles.resultName}>{s.full_name}</p><p className={tStyles.resultMeta}>{s.class_label} · {s.admission_number}</p></div>
                    {s.outstanding_fees > 0 && <span className={tStyles.debtBadge}>₦{s.outstanding_fees.toLocaleString()} owed</span>}
                  </button>
                ))}

                {selectedStudent && hasDebt && (
                  <div className={tStyles.warningBox} style={{ marginTop: 'var(--space-3)' }}>
                    <p className={tStyles.warningTitle}>⚠️ Outstanding Fees</p>
                    <p className={tStyles.warningText}>This student has ₦{selectedStudent.outstanding_fees.toLocaleString()} in unpaid fees. Acknowledge before continuing.</p>
                    <label className={tStyles.ackRow}>
                      <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className={tStyles.checkbox} />
                      <span className={tStyles.ackLabel}>I acknowledge the debt will follow this student</span>
                    </label>
                  </div>
                )}

                {selectedStudent && (!hasDebt || acknowledged) && (
                  <>
                    <div className={tStyles.searchRow} style={{ marginTop: 'var(--space-4)' }}>
                      <input className={tStyles.input} placeholder="Search destination school…" value={schoolSearch} onChange={e => setSchoolSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchSchools()} />
                      <button className={tStyles.searchBtn} onClick={searchSchools}>Search</button>
                    </div>
                    {schoolResults.map(s => (
                      <button key={s.id} className={`${tStyles.resultRow} ${selectedSchool?.id === s.id ? tStyles.resultRowActive : ''}`} onClick={() => setSelectedSchool(s)}>
                        <div><p className={tStyles.resultName}>{s.name}</p><p className={tStyles.resultMeta}>{s.city}</p></div>
                      </button>
                    ))}
                  </>
                )}

                {selectedStudent && selectedSchool && (!hasDebt || acknowledged) && (
                  <>
                    <p className={tStyles.confirmText} style={{ marginTop: 'var(--space-4)' }}><strong>{selectedStudent.full_name}</strong> → <strong>{selectedSchool.name}</strong></p>
                    <p className={tStyles.confirmSub}>The destination school's principal will need to approve this.</p>
                    {error && <p className={tStyles.errorMsg}>{error}</p>}
                    <button className={tStyles.transferBtn} onClick={submitTransfer} disabled={submitting}>{submitting ? 'Sending…' : '✈️ Send Transfer Request'}</button>
                  </>
                )}
                <div className={styles.modalActions} style={{ marginTop: 'var(--space-4)' }}><button className={styles.btnGhost} onClick={resetModal}>Cancel</button></div>
              </>
            )}
          </div>
        </div>
      )}
      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
