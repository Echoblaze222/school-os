'use client'
// src/app/dashboard/principal/students/transfer/TransferClient.tsx

import { useEffect, useState, useCallback, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { StudentSearchResult, PendingTransfer, SchoolOption } from './page'
import styles from './transfer.module.css'

interface Props {
  principalId: string
  mySchoolId: string | null
  pendingTransfers: PendingTransfer[]
  schoolOptions: SchoolOption[]
}

type Tab = 'initiate' | 'incoming'

function initials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() }
function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const days = Math.floor(d / 86400000)
  return days === 0 ? 'Today' : `${days}d ago`
}

const IconChevronLeft = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M15 18l-6-6 6-6"/></svg>
const IconSun = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IconX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconAlertTriangle = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
const IconCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><polyline points="20 6 9 17 4 12"/></svg>
const IconAlertCircle = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>

export default function TransferClient({ principalId, mySchoolId, pendingTransfers: initialPending, schoolOptions }: Props) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [tab, setTab] = useState<Tab>('initiate')
  const [toast, setToast] = useState<string | null>(null)

  // Initiate flow
  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState<StudentSearchResult[]>([])
  const [isSearchingStudent, setIsSearchingStudent] = useState(false)
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null)
  const [destSchool, setDestSchool] = useState('')
  const [transferNotes, setTransferNotes] = useState('')
  const [feeAcknowledged, setFeeAcknowledged] = useState(false)
  const [isInitiating, setIsInitiating] = useState(false)
  const [initiateStatus, setInitiateStatus] = useState<'idle'|'success'|'error'>('idle')
  const [initiateError, setInitiateError] = useState('')

  // Pending transfers
  const [pending, setPending] = useState<PendingTransfer[]>(initialPending)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})
  const [actionLoading, setActionLoading] = useState<Set<string>>(new Set())

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme')
    const dark = saved !== 'light'
    setIsDark(dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('schoolos_theme', next ? 'dark' : 'light')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  // Debounced student search
  useEffect(() => {
    if (selectedStudent || studentQuery.length < 2) { setStudentResults([]); return }
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(async () => {
      setIsSearchingStudent(true)
      const supabase = createClient()
      const { data } = await supabase
        .from('student_profiles')
        .select(`
          id, full_name, student_number, class_id, school_id,
          classes(name), schools(name),
          fee_invoices(amount_due, amount_paid)
        `)
        .or(`full_name.ilike.%${studentQuery}%,student_number.ilike.%${studentQuery}%`)
        .eq('school_id', mySchoolId ?? '')
        .limit(8)

      setStudentResults(
        (data ?? []).map((s: any) => {
          const outstanding = (s.fee_invoices ?? []).reduce((sum: number, inv: any) => sum + Math.max((inv.amount_due ?? 0) - (inv.amount_paid ?? 0), 0), 0)
          return {
            id: s.id, full_name: s.full_name ?? 'Unknown',
            student_number: s.student_number ?? null,
            class_name: s.classes?.name ?? null, class_id: s.class_id ?? null,
            school_id: s.school_id ?? null, school_name: s.schools?.name ?? null,
            outstanding_fees: outstanding, total_subjects: 0, avg_score: null,
          }
        })
      )
      setIsSearchingStudent(false)
    }, 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [studentQuery, selectedStudent, mySchoolId])

  async function loadStudentDetails(s: StudentSearchResult) {
    const supabase = createClient()
    const { data: results } = await supabase
      .from('results')
      .select('score, max_score')
      .eq('student_id', s.id)

    const rows = results ?? []
    const avg = rows.length > 0
      ? Math.round(rows.reduce((sum: number, r: any) => sum + (r.max_score > 0 ? (r.score / r.max_score) * 100 : 0), 0) / rows.length)
      : null

    setSelectedStudent({ ...s, avg_score: avg, total_subjects: rows.length })
    setStudentQuery('')
    setStudentResults([])
  }

  async function initiateTransfer() {
    if (!selectedStudent || !destSchool) return
    if (selectedStudent.outstanding_fees > 0 && !feeAcknowledged) return
    setIsInitiating(true)
    setInitiateStatus('idle')
    const supabase = createClient()
    const now = new Date().toISOString()

    const { error } = await supabase.from('student_transfers').insert({
      student_id: selectedStudent.id,
      origin_school_id: mySchoolId,
      destination_school_id: destSchool,
      status: 'requested',
      initiated_by: principalId,
      initiated_at: now,
      notes: transferNotes || null,
    })

    if (!error) {
      // Notify destination principal
      const { data: destSchoolRow } = await supabase
        .from('schools')
        .select('principal_id')
        .eq('id', destSchool)
        .single()

      if ((destSchoolRow as any)?.principal_id) {
        await supabase.from('notifications').insert({
          user_id: (destSchoolRow as any).principal_id,
          title: 'Incoming Transfer Request',
          body: `A transfer request for ${selectedStudent.full_name} has been sent to your school.`,
          type: 'transfer', read: false, created_at: now,
        })
      }

      setInitiateStatus('success')
      setSelectedStudent(null)
      setDestSchool('')
      setTransferNotes('')
      setFeeAcknowledged(false)
    } else {
      setInitiateStatus('error')
      setInitiateError(error.message)
    }
    setIsInitiating(false)
  }

  async function approveTransfer(t: PendingTransfer) {
    setActionLoading(prev => new Set(prev).add(t.id))
    const supabase = createClient()
    const now = new Date().toISOString()

    // Update transfer status
    const { error } = await supabase
      .from('student_transfers')
      .update({ status: 'completed', approved_at: now, approved_by: principalId })
      .eq('id', t.id)

    if (!error) {
      // Move student to destination school
      await supabase.from('student_profiles')
        .update({ school_id: mySchoolId, class_id: null })
        .eq('id', t.student_id)

      // Notify student
      await supabase.from('notifications').insert({
        user_id: t.student_id,
        title: 'Transfer Approved',
        body: 'Your school transfer has been approved. Welcome to your new school!',
        type: 'transfer', read: false, created_at: now,
      })

      setPending(prev => prev.filter(p => p.id !== t.id))
      showToast(`Transfer for ${t.student_name} approved`)
    }
    setActionLoading(prev => { const n = new Set(prev); n.delete(t.id); return n })
  }

  async function rejectTransfer(t: PendingTransfer) {
    const reason = rejectReason[t.id] ?? ''
    setActionLoading(prev => new Set(prev).add(t.id))
    const supabase = createClient()
    const now = new Date().toISOString()

    const { error } = await supabase
      .from('student_transfers')
      .update({ status: 'rejected', rejection_reason: reason || null, rejected_at: now, rejected_by: principalId })
      .eq('id', t.id)

    if (!error) {
      // Notify origin principal (simplified: notify student)
      await supabase.from('notifications').insert({
        user_id: t.student_id,
        title: 'Transfer Rejected',
        body: `Your transfer request was rejected.${reason ? ` Reason: ${reason}` : ''}`,
        type: 'transfer', read: false, created_at: now,
      })
      setPending(prev => prev.filter(p => p.id !== t.id))
      showToast(`Transfer for ${t.student_name} rejected`)
    }
    setActionLoading(prev => { const n = new Set(prev); n.delete(t.id); return n })
    setRejectingId(null)
  }

  const hasOutstandingFees = (selectedStudent?.outstanding_fees ?? 0) > 0
  const canInitiate = !!selectedStudent && !!destSchool && (!hasOutstandingFees || feeAcknowledged)

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/principal/students" className={styles.backBtn}><IconChevronLeft /> Students</Link>
          <h1 className={styles.pageTitle}>Student <span>Transfers</span></h1>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.themeBtn} onClick={toggleTheme}>{isDark ? <IconSun /> : <IconMoon />}</button>
        </div>
      </header>

      <div style={{ padding: 'var(--space-6) var(--space-6) 0', position: 'relative', zIndex: 1 }}>
        <div className={styles.tabBar}>
          <button className={`${styles.tabBtn} ${tab === 'initiate' ? styles.tabBtnActive : ''}`} onClick={() => setTab('initiate')}>Initiate Transfer</button>
          <button className={`${styles.tabBtn} ${tab === 'incoming' ? styles.tabBtnActive : ''}`} onClick={() => setTab('incoming')}>
            Incoming {pending.length > 0 && `(${pending.length})`}
          </button>
        </div>
      </div>

      <div className={styles.content} key={tab}>
        {/* ── INITIATE TAB ── */}
        {tab === 'initiate' && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <p className={styles.cardTitle}>Initiate Student Transfer</p>
              <p className={styles.cardSubtitle}>Search for a student in your school and select the destination</p>
            </div>
            <div className={styles.cardBody}>
              {initiateStatus === 'success' && (
                <div className={styles.statusSuccess}><IconCheck /> Transfer request sent! The destination school has been notified.</div>
              )}
              {initiateStatus === 'error' && (
                <div className={styles.statusError}><IconAlertCircle /> {initiateError}</div>
              )}

              {/* Student search */}
              {!selectedStudent ? (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Search Student</label>
                  <div style={{ position: 'relative' }}>
                    <div className={styles.searchWrap}>
                      <span className={styles.searchIcon}><IconSearch /></span>
                      <input
                        className={styles.searchInput}
                        placeholder="Name or admission number…"
                        value={studentQuery}
                        onChange={e => setStudentQuery(e.target.value)}
                      />
                    </div>
                    {(studentResults.length > 0 || isSearchingStudent) && (
                      <div className={styles.searchResults}>
                        {isSearchingStudent
                          ? <div className={styles.searchingText}>Searching…</div>
                          : studentResults.map(s => (
                            <div key={s.id} className={styles.searchItem} onClick={() => loadStudentDetails(s)}>
                              <div className={styles.searchAvatar}>{initials(s.full_name)}</div>
                              <div>
                                <p className={styles.searchName}>{s.full_name}</p>
                                <p className={styles.searchMeta}>{s.student_number ?? '—'} · {s.class_name ?? 'No class'}</p>
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className={styles.selectedCard}>
                  <div className={styles.selectedHeader}>
                    <div className={styles.selectedAvatar}>{initials(selectedStudent.full_name)}</div>
                    <div>
                      <p className={styles.selectedName}>{selectedStudent.full_name}</p>
                      <p className={styles.selectedMeta}>{selectedStudent.student_number ?? '—'} · {selectedStudent.class_name ?? 'No class'}</p>
                    </div>
                    <button className={styles.clearBtn} onClick={() => setSelectedStudent(null)}><IconX /></button>
                  </div>
                  <div className={styles.profileGrid}>
                    <div className={styles.profileField}>
                      <span className={styles.profileLabel}>Current School</span>
                      <span className={styles.profileValue}>{selectedStudent.school_name ?? '—'}</span>
                    </div>
                    <div className={styles.profileField}>
                      <span className={styles.profileLabel}>Class</span>
                      <span className={styles.profileValue}>{selectedStudent.class_name ?? '—'}</span>
                    </div>
                    <div className={styles.profileField}>
                      <span className={styles.profileLabel}>Avg Score</span>
                      <span className={styles.profileValue}>{selectedStudent.avg_score !== null ? `${selectedStudent.avg_score}%` : '—'}</span>
                    </div>
                    <div className={styles.profileField}>
                      <span className={styles.profileLabel}>Outstanding Fees</span>
                      <span className={styles.profileValue} style={{ color: selectedStudent.outstanding_fees > 0 ? 'var(--error)' : 'var(--success)' }}>
                        {selectedStudent.outstanding_fees > 0 ? `₦${selectedStudent.outstanding_fees.toLocaleString()}` : 'None'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Outstanding fee warning */}
              {selectedStudent && hasOutstandingFees && (
                <div className={styles.feeWarning}>
                  <div className={styles.feeWarningIcon}><IconAlertTriangle /></div>
                  <div>
                    <p className={styles.feeWarningTitle}>Outstanding Fees</p>
                    <p className={styles.feeWarningText}>
                      This student has ₦{selectedStudent.outstanding_fees.toLocaleString()} in unpaid fees. Transferring does not automatically clear these debts.
                    </p>
                    <div className={styles.acknowledgeRow}>
                      <input type="checkbox" id="ack" checked={feeAcknowledged} onChange={e => setFeeAcknowledged(e.target.checked)} />
                      <label htmlFor="ack" className={styles.acknowledgeLabel}>I acknowledge this student has outstanding fees and still wish to proceed.</label>
                    </div>
                  </div>
                </div>
              )}

              {/* Destination school */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Destination School</label>
                <select
                  className={`${styles.fieldInput} ${styles.fieldSelect}`}
                  value={destSchool}
                  onChange={e => setDestSchool(e.target.value)}
                >
                  <option value="">Select destination school…</option>
                  {schoolOptions.map(s => <option key={s.id} value={s.id}>{s.name}{s.address ? ` — ${s.address}` : ''}</option>)}
                </select>
              </div>

              {/* Notes */}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Transfer Notes (optional)</label>
                <textarea
                  className={`${styles.fieldInput} ${styles.fieldTextarea}`}
                  placeholder="Reason for transfer, special circumstances…"
                  value={transferNotes}
                  onChange={e => setTransferNotes(e.target.value)}
                  rows={3}
                />
              </div>

              <button className={styles.initiateBtn} onClick={initiateTransfer} disabled={!canInitiate || isInitiating}>
                {isInitiating ? 'Sending Request…' : 'Initiate Transfer'}
              </button>
            </div>
          </div>
        )}

        {/* ── INCOMING TAB ── */}
        {tab === 'incoming' && (
          <div>
            {pending.length === 0 ? (
              <div className={styles.emptyState}>No pending incoming transfer requests.</div>
            ) : (
              <div className={styles.transferList}>
                {pending.map(t => {
                  const loading = actionLoading.has(t.id)
                  return (
                    <div key={t.id} className={styles.transferCard}>
                      <div className={styles.transferTop}>
                        <div className={styles.transferAvatar}>{initials(t.student_name)}</div>
                        <div>
                          <p className={styles.transferName}>{t.student_name}</p>
                          <p className={styles.transferFrom}>From: {t.origin_school_name ?? 'Unknown school'} · {relTime(t.initiated_at)}</p>
                          {t.notes && <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: 4 }}>{t.notes}</p>}
                        </div>
                        <span className={styles.requestedBadge}>Pending</span>
                      </div>

                      <div className={styles.transferStats}>
                        <div className={styles.transferStat}>
                          <span className={styles.transferStatValue}>{t.avg_score !== null ? `${t.avg_score}%` : '—'}</span>
                          <span className={styles.transferStatLabel}>Avg Score</span>
                        </div>
                        <div className={styles.transferStat}>
                          <span className={styles.transferStatValue}>{t.total_results}</span>
                          <span className={styles.transferStatLabel}>Results</span>
                        </div>
                        <div className={styles.transferStat}>
                          <span className={styles.transferStatValue}>{t.student_number ?? '—'}</span>
                          <span className={styles.transferStatLabel}>Adm. No.</span>
                        </div>
                      </div>

                      <div className={styles.transferActions}>
                        <button className={styles.approveBtn} onClick={() => approveTransfer(t)} disabled={loading}>
                          {loading ? 'Processing…' : 'Approve Transfer'}
                        </button>
                        <button
                          className={styles.rejectBtn}
                          onClick={() => setRejectingId(rejectingId === t.id ? null : t.id)}
                          disabled={loading}
                        >
                          Reject
                        </button>
                      </div>

                      {rejectingId === t.id && (
                        <div className={styles.rejectReason}>
                          <input
                            className={styles.rejectReasonInput}
                            placeholder="Reason for rejection (optional)…"
                            value={rejectReason[t.id] ?? ''}
                            onChange={e => setRejectReason(p => ({ ...p, [t.id]: e.target.value }))}
                          />
                          <button className={styles.confirmRejectBtn} onClick={() => rejectTransfer(t)} disabled={loading}>
                            Confirm
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Right side decorative for initiate tab */}
        {tab === 'initiate' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
            <div className={styles.card} style={{ animationDelay: '80ms' }}>
              <div className={styles.cardHeader}>
                <p className={styles.cardTitle}>How Transfers Work</p>
              </div>
              <div className={styles.cardBody}>
                {[
                  ['1', 'Search for the student in your school'],
                  ['2', 'Review their profile, fees, and academic record'],
                  ['3', 'Select the destination school'],
                  ['4', 'Acknowledge any outstanding fees'],
                  ['5', 'Submit — destination principal is notified'],
                  ['6', 'They approve or reject on their end'],
                ].map(([num, text]) => (
                  <div key={num} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div style={{ width: 22, height: 22, borderRadius: 99999, background: 'var(--burgundy-subtle)', border: '1px solid rgba(128,0,32,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.68rem', fontWeight: 800, color: 'var(--text-accent)', flexShrink: 0 }}>{num}</div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, paddingTop: 2 }}>{text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
