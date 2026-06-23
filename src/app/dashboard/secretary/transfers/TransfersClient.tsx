'use client'
// src/app/dashboard/secretary/transfers/TransfersClient.tsx

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

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
  debt_note: string | null
  // FIX: removed from_class / to_class — those columns don't exist in student_transfers
  origin_school_id: string
  destination_school_id: string
}

interface StudentLite  { id: string; full_name: string; admission_number: string | null; class_id?: string | null }
interface SchoolLite   { id: string; name: string; city: string | null }
interface SearchStudent { id: string; full_name: string; admission_number: string; class_label: string; outstanding_fees: number }
interface SearchSchool  { id: string; name: string; city: string }

interface AllStudent {
  id: string; full_name: string; email?: string
  admission_number: string | null; class_id: string | null; class_name: string | null
  is_active: boolean; onboarding_stage: string; created_at: string
}

interface Props {
  sent: TransferRow[]
  received: TransferRow[]
  studentProfiles: StudentLite[]
  schools: SchoolLite[]
  allStudents: AllStudent[]      // NEW: full student list for the Students tab
  profile: any
  school: any
  userId: string
}

const STATUS_COLORS: Record<string, string> = {
  requested: '#F59E0B', approved: '#3B82F6', completed: '#10B981', rejected: '#EF4444',
}

function fmtDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function TransfersClient({
  sent: initSent, received: initReceived,
  studentProfiles, schools, allStudents,
  profile, school, userId,
}: Props) {
  const [sent, setSent]    = useState(initSent)
  const [received]         = useState(initReceived)
  const [extraSchools, setExtraSchools] = useState<SchoolLite[]>([])

  // Top-level tabs: Students list | Transfers (sent/received)
  const [mainTab,    setMainTab]    = useState<'students' | 'transfers'>('students')
  const [direction,  setDirection]  = useState<'sent' | 'received'>('sent')
  const [statusTab,  setStatusTab]  = useState<'all' | TransferStatus>('all')
  const [search,     setSearch]     = useState('')
  const [viewItem,   setViewItem]   = useState<(TransferRow & { direction: 'sent' | 'received' }) | null>(null)
  const [viewStudent, setViewStudent] = useState<AllStudent | null>(null)
  const [modal,      setModal]      = useState(false)

  // New-transfer flow
  const [studentSearch,   setStudentSearch]   = useState('')
  const [studentResults,  setStudentResults]  = useState<SearchStudent[]>([])
  const [selectedStudent, setSelectedStudent] = useState<SearchStudent | null>(null)
  const [schoolSearch,    setSchoolSearch]    = useState('')
  const [schoolResults,   setSchoolResults]   = useState<SearchSchool[]>([])
  const [selectedSchool,  setSelectedSchool]  = useState<SearchSchool | null>(null)
  const [acknowledged,    setAcknowledged]    = useState(false)
  const [submitting,      setSubmitting]      = useState(false)
  const [success,         setSuccess]         = useState(false)
  const [formError,       setFormError]       = useState<string | null>(null)

  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

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
  function schoolName(id: string)  { return schoolMap.get(id)?.name ?? 'Unknown school' }

  const hasDebt = (selectedStudent?.outstanding_fees ?? 0) > 0

  const transferRows: Array<TransferRow & { direction: 'sent' | 'received' }> = direction === 'sent'
    ? sent.map(t => ({ ...t, direction: 'sent' as const }))
    : received.map(t => ({ ...t, direction: 'received' as const }))

  const filteredTransfers = transferRows.filter(r => statusTab === 'all' || r.status === statusTab)

  // Student list filtering
  const filteredStudents = allStudents.filter(s =>
    s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    s.admission_number?.toLowerCase().includes(search.toLowerCase()) ||
    s.email?.toLowerCase().includes(search.toLowerCase()) ||
    s.class_name?.toLowerCase().includes(search.toLowerCase())
  )

  async function searchStudents() {
    if (!studentSearch.trim()) return
    // FIX: query profiles directly (not student_profiles join) — student_profiles has no school_id
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, admission_number, class_id')
      .eq('role', 'student')
      .eq('school_id', profile.school_id)
      .ilike('full_name', `%${studentSearch}%`)
      .limit(10)

    // Get outstanding fees per student
    const results: SearchStudent[] = []
    for (const p of data ?? []) {
      const { data: inv } = await supabase
        .from('school_fees')
        .select('amount_ngn, paid_ngn')
        .eq('student_id', p.id)
        .eq('school_id', profile.school_id)
      const fees = (inv ?? []).reduce((s: number, i: any) =>
        s + Math.max(0, (i.amount_ngn ?? 0) - (i.paid_ngn ?? 0)), 0)
      results.push({
        id: p.id,
        full_name: p.full_name,
        admission_number: p.admission_number ?? '—',
        class_label: '—',
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
      .neq('id', profile.school_id)
      .limit(10)
    setSchoolResults(data ?? [])
  }

  async function submitTransfer() {
    if (!selectedStudent || !selectedSchool) return
    setSubmitting(true); setFormError(null)

    const { data, error: err } = await supabase
      .from('student_transfers')
      .insert({
        student_id:            selectedStudent.id,
        origin_school_id:      profile.school_id,
        destination_school_id: selectedSchool.id,
        initiated_by:          userId,
        status:                'requested',
        has_outstanding_fees:  hasDebt,
        outstanding_amount:    hasDebt ? selectedStudent.outstanding_fees : null,
        debt_acknowledged:     hasDebt ? acknowledged : false,
      })
      .select()
      .single()

    if (!err && data) {
      setSent(p => [data, ...p])
      setExtraSchools(p => [...p, { id: selectedSchool.id, name: selectedSchool.name, city: selectedSchool.city }])
      setSuccess(true)
    } else {
      setFormError(err?.message ?? 'Failed to initiate transfer')
    }
    setSubmitting(false)
  }

  function resetModal() {
    setModal(false); setSuccess(false); setFormError(null)
    setStudentSearch(''); setStudentResults([]); setSelectedStudent(null)
    setSchoolSearch(''); setSchoolResults([]); setSelectedSchool(null)
    setAcknowledged(false)
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Transfers">

      {/* ── Main tab switcher ── */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {(['students', 'transfers'] as const).map(t => (
          <button key={t} onClick={() => setMainTab(t)}
            style={{ padding: '8px 18px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
              background: mainTab === t ? sc + '22' : 'var(--glass-bg)',
              borderColor: mainTab === t ? sc : 'var(--glass-border)',
              color: mainTab === t ? sc : 'var(--text-muted)',
            }}>
            {t === 'students' ? `🎓 Students (${allStudents.length})` : `✈️ Transfers (${sent.length + received.length})`}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className={styles.btnPrimary}
          onClick={() => setModal(true)}
          style={{ height: 40, padding: '0 var(--space-4)', fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
          + New Transfer
        </button>
      </div>

      {/* ══════════════ STUDENTS TAB ══════════════ */}
      {mainTab === 'students' && (
        <>
          {/* Search */}
          <div className={styles.searchBar} style={{ marginBottom: 'var(--space-4)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input className={styles.searchInput} placeholder="Search by name, admission number, class…"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {/* Stats strip */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            {[
              { label: 'Total',    value: allStudents.length,                            color: '#10B981' },
              { label: 'Active',   value: allStudents.filter(s => s.is_active).length,   color: '#3B82F6' },
              { label: 'Transfers', value: sent.length,                                  color: '#F59E0B' },
            ].map(s => (
              <div key={s.label} className={styles.statCard}>
                <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
                <p className={styles.statLbl}>{s.label}</p>
              </div>
            ))}
          </div>

          {filteredStudents.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyEmoji}>🎓</p>
              <p className={styles.emptyTitle}>No students found</p>
              <p className={styles.emptyHint}>{search ? 'Try a different search' : 'Students enrolled in this school appear here'}</p>
            </div>
          ) : (
            filteredStudents.map(s => (
              <div key={s.id} className={styles.listItem} onClick={() => setViewStudent(s)} style={{ cursor: 'pointer' }}>
                {/* Avatar */}
                <div className={styles.listIconBox}
                  style={{ background: sc + '22', fontWeight: 800, fontSize: '1rem', color: sc }}>
                  {s.full_name?.[0]?.toUpperCase() ?? '?'}
                </div>
                <div className={styles.listContent}>
                  <p className={styles.listTitle}>{s.full_name}</p>
                  <p className={styles.listSub}>
                    {s.admission_number ?? 'No code'} · {s.class_name ?? 'No class'}{s.email ? ` · ${s.email}` : ''}
                  </p>
                </div>
                <span className={`${styles.listBadge} ${s.is_active ? styles.badgeGreen : styles.badgeYellow}`}>
                  {s.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            ))
          )}
        </>
      )}

      {/* ══════════════ TRANSFERS TAB ══════════════ */}
      {mainTab === 'transfers' && (
        <>
          {/* Sent / Received direction */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
            {(['sent', 'received'] as const).map(d => (
              <button key={d} onClick={() => { setDirection(d); setStatusTab('all') }}
                style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer',
                  background: direction === d ? sc + '22' : 'var(--glass-bg)',
                  borderColor: direction === d ? sc : 'var(--glass-border)',
                  color: direction === d ? sc : 'var(--text-muted)',
                }}>
                {d === 'sent' ? `Sent (${sent.length})` : `Received (${received.length})`}
              </button>
            ))}
          </div>

          {/* Status sub-tabs */}
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-5)', overflowX: 'auto', paddingBottom: 4 }}>
            {(['all', 'requested', 'approved', 'completed', 'rejected'] as const).map(t => {
              const count = t === 'all' ? transferRows.length : transferRows.filter(r => r.status === t).length
              const color = t === 'all' ? sc : STATUS_COLORS[t]
              return (
                <button key={t} onClick={() => setStatusTab(t)}
                  style={{ padding: '6px 14px', borderRadius: 'var(--radius-full)', border: '1px solid', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                    background: statusTab === t ? color + '22' : 'var(--glass-bg)',
                    borderColor: statusTab === t ? color : 'var(--glass-border)',
                    color: statusTab === t ? color : 'var(--text-muted)',
                  }}>
                  {t.charAt(0).toUpperCase() + t.slice(1)} ({count})
                </button>
              )
            })}
          </div>

          {filteredTransfers.length === 0 ? (
            <div className={styles.emptyState}>
              <p className={styles.emptyEmoji}>✈️</p>
              <p className={styles.emptyTitle}>No {direction} transfers</p>
              <p className={styles.emptyHint}>
                {direction === 'sent'
                  ? 'Transfers you initiate for students leaving this school appear here'
                  : 'Transfer requests from other schools appear here'}
              </p>
            </div>
          ) : (
            filteredTransfers.map(r => (
              <div key={r.id} className={styles.listItem} onClick={() => setViewItem(r)} style={{ cursor: 'pointer' }}>
                <div className={styles.listIconBox} style={{ background: STATUS_COLORS[r.status] + '22' }}>
                  <span style={{ fontSize: '1.1rem' }}>✈️</span>
                </div>
                <div className={styles.listContent}>
                  <p className={styles.listTitle}>{studentName(r.student_id)}</p>
                  <p className={styles.listSub}>
                    {r.direction === 'sent'
                      ? `→ ${schoolName(r.destination_school_id)}`
                      : `← ${schoolName(r.origin_school_id)}`
                    } · {fmtDate(r.requested_at)}
                  </p>
                </div>
                <span className={styles.listBadge}
                  style={{ background: STATUS_COLORS[r.status] + '22', color: STATUS_COLORS[r.status], textTransform: 'capitalize' }}>
                  {r.status}
                </span>
              </div>
            ))
          )}
        </>
      )}

      {/* ── Student detail modal ── */}
      {viewStudent && (
        <div className={styles.modalOverlay} onClick={() => setViewStudent(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            {/* Avatar header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', marginBottom: 'var(--space-5)' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: sc + '33', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem', fontWeight: 800, color: sc, flexShrink: 0 }}>
                {viewStudent.full_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div>
                <p className={styles.modalTitle} style={{ margin: 0 }}>{viewStudent.full_name}</p>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{viewStudent.class_name ?? 'No class assigned'}</p>
              </div>
            </div>

            {([
              ['Admission No.', viewStudent.admission_number ?? '—'],
              ['Class',         viewStudent.class_name ?? '—'],
              ['Email',         viewStudent.email ?? '—'],
              ['Status',        viewStudent.is_active ? 'Active' : 'Inactive'],
              ['Enrolled',      fmtDate(viewStudent.created_at)],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontWeight: 600, color: l === 'Status' ? (viewStudent.is_active ? '#10B981' : '#F59E0B') : 'var(--text-primary)' }}>{v}</span>
              </div>
            ))}

            {/* Transfer action */}
            <button
              onClick={() => {
                setViewStudent(null)
                setStudentSearch(viewStudent.full_name)
                setModal(true)
              }}
              className={styles.btnPrimary}
              style={{ width: '100%', marginTop: 'var(--space-5)' }}>
              ✈️ Initiate Transfer for this Student
            </button>
          </div>
        </div>
      )}

      {/* ── Transfer detail modal ── */}
      {viewItem && (
        <div className={styles.modalOverlay} onClick={() => setViewItem(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>{studentName(viewItem.student_id)}</h2>
            {([
              [viewItem.direction === 'sent' ? 'Destination School' : 'Origin School',
               schoolName(viewItem.direction === 'sent' ? viewItem.destination_school_id : viewItem.origin_school_id)],
              ['Status',     viewItem.status],
              ['Requested',  fmtDate(viewItem.requested_at)],
              ['Approved',   fmtDate(viewItem.approved_at)],
              ['Completed',  fmtDate(viewItem.completed_at)],
              ['Outstanding Fees', viewItem.has_outstanding_fees ? `₦${(viewItem.outstanding_amount ?? 0).toLocaleString()}` : 'None'],
            ] as [string, string][]).map(([l, v]) => (
              <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-3) 0', borderBottom: '1px solid var(--glass-border)', fontSize: '0.85rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>{l}</span>
                <span style={{ fontWeight: 600, color: l === 'Status' ? STATUS_COLORS[viewItem.status] : 'var(--text-primary)', textTransform: l === 'Status' ? 'capitalize' : 'none' }}>{v}</span>
              </div>
            ))}
            {viewItem.status === 'rejected' && viewItem.rejection_reason && (
              <p style={{ fontSize: '0.8rem', color: '#EF4444', marginTop: 'var(--space-3)', lineHeight: 1.5 }}>
                Reason: {viewItem.rejection_reason}
              </p>
            )}
            {viewItem.debt_note && (
              <p style={{ fontSize: '0.78rem', color: '#F59E0B', marginTop: 'var(--space-3)', lineHeight: 1.5 }}>
                Debt note: {viewItem.debt_note}
              </p>
            )}
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 'var(--space-4)', lineHeight: 1.5 }}>
              {viewItem.direction === 'sent'
                ? "The destination school's principal approves or rejects this request."
                : "Your school's principal reviews incoming requests from the Pending Transfers page."}
            </p>
          </div>
        </div>
      )}

      {/* ── New Transfer modal ── */}
      {modal && (
        <div className={styles.modalOverlay} onClick={resetModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            {success ? (
              <div style={{ textAlign: 'center', padding: 'var(--space-8) var(--space-4)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-4)' }}>
                <p style={{ fontSize: '3rem' }}>✈️</p>
                <p style={{ fontFamily: 'var(--font-display)', fontSize: '1.3rem', fontWeight: 800, color: sc }}>Transfer Initiated</p>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', maxWidth: 280, lineHeight: 1.7 }}>
                  The principal of <strong>{selectedSchool?.name}</strong> has been notified and will review this request.
                </p>
                <button className={styles.btnPrimary} onClick={resetModal} style={{ width: '100%' }}>Done</button>
              </div>
            ) : (
              <>
                <h2 className={styles.modalTitle}>New Transfer</h2>

                {/* Step 1: find student */}
                <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 'var(--space-2)' }}>Step 1 — Select Student</p>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                  <input className={styles.formInput} placeholder="Search by name…"
                    value={studentSearch} onChange={e => setStudentSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchStudents()} style={{ flex: 1 }} />
                  <button className={styles.btnPrimary} onClick={searchStudents} style={{ height: 44, padding: '0 var(--space-4)', whiteSpace: 'nowrap' }}>Search</button>
                </div>

                {studentResults.map(s => (
                  <button key={s.id}
                    onClick={() => setSelectedStudent(s)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--space-3)', padding: 'var(--space-3) var(--space-4)', background: selectedStudent?.id === s.id ? sc + '22' : 'var(--glass-bg)', border: `1px solid ${selectedStudent?.id === s.id ? sc : 'var(--glass-border)'}`, borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)', cursor: 'pointer', textAlign: 'left' }}>
                    <div>
                      <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{s.full_name}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{s.class_label} · {s.admission_number}</p>
                    </div>
                    {s.outstanding_fees > 0 && (
                      <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#EF4444', background: 'rgba(239,68,68,0.12)', padding: '3px 8px', borderRadius: 'var(--radius-full)', flexShrink: 0 }}>
                        ₦{s.outstanding_fees.toLocaleString()} owed
                      </span>
                    )}
                  </button>
                ))}

                {/* Debt warning */}
                {selectedStudent && hasDebt && (
                  <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', marginTop: 'var(--space-3)' }}>
                    <p style={{ fontWeight: 800, color: '#F59E0B', marginBottom: 'var(--space-2)', fontSize: '0.85rem' }}>⚠️ Outstanding Fees</p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 1.6 }}>
                      This student has ₦{selectedStudent.outstanding_fees.toLocaleString()} in unpaid fees. This debt will follow the student to the new school.
                    </p>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-2)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} style={{ marginTop: 2, accentColor: sc }} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>I acknowledge the debt will follow this student</span>
                    </label>
                  </div>
                )}

                {/* Step 2: find destination school */}
                {selectedStudent && (!hasDebt || acknowledged) && (
                  <>
                    <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 'var(--space-5) 0 var(--space-2)' }}>Step 2 — Destination School</p>
                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-3)' }}>
                      <input className={styles.formInput} placeholder="Search school name…"
                        value={schoolSearch} onChange={e => setSchoolSearch(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && searchSchools()} style={{ flex: 1 }} />
                      <button className={styles.btnPrimary} onClick={searchSchools} style={{ height: 44, padding: '0 var(--space-4)', whiteSpace: 'nowrap' }}>Search</button>
                    </div>

                    {schoolResults.map(s => (
                      <button key={s.id}
                        onClick={() => setSelectedSchool(s)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'var(--space-3) var(--space-4)', background: selectedSchool?.id === s.id ? sc + '22' : 'var(--glass-bg)', border: `1px solid ${selectedSchool?.id === s.id ? sc : 'var(--glass-border)'}`, borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-2)', cursor: 'pointer', textAlign: 'left' }}>
                        <div>
                          <p style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>{s.name}</p>
                          <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{s.city}</p>
                        </div>
                      </button>
                    ))}
                  </>
                )}

                {/* Confirm */}
                {selectedStudent && selectedSchool && (!hasDebt || acknowledged) && (
                  <>
                    <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', padding: 'var(--space-4)', margin: 'var(--space-4) 0 var(--space-3)', textAlign: 'center' }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                        {selectedStudent.full_name} → {selectedSchool.name}
                      </p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>The destination school's principal will approve or reject this request.</p>
                    </div>
                    {formError && <p style={{ fontSize: '0.78rem', color: '#EF4444', marginBottom: 'var(--space-3)' }}>{formError}</p>}
                    <button className={styles.btnPrimary} onClick={submitTransfer} disabled={submitting} style={{ width: '100%' }}>
                      {submitting ? 'Sending…' : '✈️ Send Transfer Request'}
                    </button>
                  </>
                )}

                <div className={styles.modalActions} style={{ marginTop: 'var(--space-4)' }}>
                  <button className={styles.btnGhost} onClick={resetModal}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
