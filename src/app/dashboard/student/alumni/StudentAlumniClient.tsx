'use client'

// src/app/dashboard/student/alumni/StudentAlumniClient.tsx
//
// FIX (carried over): this page previously rendered its own hardcoded
// bottom nav (bottom-nav / nav-item / nav-home classes — none of which
// exist in globals.css, so it rendered unstyled) instead of the canonical
// nav pair every other student page uses. Also replaced the leftover
// --burgundy-* / --error inline styles with the real tokens (--brand-*,
// --danger) now that alumni-student.module.css has been rebuilt on the
// actual design system.
//
// REDESIGN PASS (Lane 3 — Student):
//   - StudentNav + DashboardHeader → RolePageWrapper (matches every other
//     converted sub-page; also fixes the same "nested <main>" mistake by
//     rendering content as direct children, not another <main> wrapper)
//   - 🎓 / ⭐ emoji → GraduationCapIcon / AwardIcon
//   - FIX: `gradeColor(r.grade)+'1A'` concatenated a hex-alpha suffix onto
//     a var(--success)-style CSS variable reference, producing invalid CSS
//     (`var(--success)1A`) — the grade badge background was silently
//     falling back to transparent. Now uses gradeColorSubtle() instead.

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { GraduationCapIcon, AwardIcon } from '@/components/Icons'
import styles from './alumni-student.module.css'
import type { AlumniProfile, AlumniResult, AlumniReceipt } from './types'

interface Props {
  userId:           string
  profile:          any
  school:           any
  studentId:        string
  alumniProfile:    AlumniProfile
  results:          AlumniResult[]
  receipts:         AlumniReceipt[]
  transcriptStatus: string | null
}

function fmtNGN(n: number) { return new Intl.NumberFormat('en-NG',{style:'currency',currency:'NGN',maximumFractionDigits:0}).format(n) }
function fmtDate(s: string) { return new Date(s).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}) }
function initials(n: string) { return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }

function gradeColor(g: string) {
  if (g === 'A') return 'var(--success)'
  if (g === 'B') return 'var(--info)'
  if (g === 'C') return 'var(--warning)'
  if (g === 'D') return 'var(--warning)'
  return 'var(--danger)'
}
// FIX: matching -subtle token instead of concatenating alpha onto a var() reference
function gradeColorSubtle(g: string) {
  if (g === 'A') return 'var(--success-subtle)'
  if (g === 'B') return 'var(--info-subtle)'
  if (g === 'C') return 'var(--warning-subtle)'
  if (g === 'D') return 'var(--warning-subtle)'
  return 'var(--danger-subtle)'
}

export default function StudentAlumniClient({
  userId, profile, school,
  studentId, alumniProfile, results, receipts, transcriptStatus: initialStatus,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()
  const schoolColor = school?.primary_color ?? '#800020'

  const [transcriptStatus,   setTranscriptStatus]   = useState(initialStatus)
  const [requestingTranscript, setRequestingTranscript] = useState(false)
  const [transcriptError,    setTranscriptError]    = useState('')
  const [activeTab,          setActiveTab]          = useState<'results'|'fees'>('results')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem('schoolos_theme') ?? 'dark')
  }, [])

  async function requestTranscript() {
    setRequestingTranscript(true); setTranscriptError('')
    const { error } = await supabase.from('transcript_requests').insert({
      student_id:   studentId,
      status:       'pending',
      requested_at: new Date().toISOString(),
    })
    if (error) { setTranscriptError(error.message); setRequestingTranscript(false); return }
    setTranscriptStatus('pending')
    setRequestingTranscript(false)
  }

  // Group results by term+year
  const grouped = results.reduce<Record<string, AlumniResult[]>>((acc, r) => {
    const key = `${r.term} — ${r.academic_year}`
    if (!acc[key]) acc[key] = []
    acc[key].push(r)
    return acc
  }, {})

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="My Records">
        <div className={styles.orb1} aria-hidden />

        {/* Hero banner */}
        <div className={styles.heroBanner}>
          <div className={styles.heroAvatarWrap}>
            {alumniProfile.avatar_url
              ? <img src={alumniProfile.avatar_url} alt={alumniProfile.full_name} className={styles.heroAvatarImg} />
              : <span className={styles.heroAvatarText}>{initials(alumniProfile.full_name)}</span>
            }
            <div className={styles.heroCapBadge}><GraduationCapIcon size={14} color="#fff" /></div>
          </div>
          <div className={styles.heroInfo}>
            <h2 className={styles.heroName}>{alumniProfile.full_name}</h2>
            <p className={styles.heroSub}>{alumniProfile.class_name} · Class of {alumniProfile.graduation_year ?? '—'}</p>
            <div className={styles.heroBadgeRow}>
              <span className={styles.heroBadge}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
                {alumniProfile.admission_number}
              </span>
              <span className={`${styles.heroBadge} ${styles.heroBadgeAlumni}`}>
                <AwardIcon size={11} />
                {alumniProfile.lifecycle_stage === 'graduated' ? 'Graduated' : 'Alumni'}
              </span>
            </div>
          </div>
        </div>

        {/* Transcript request */}
        <div className={styles.transcriptBox}>
          <div className={styles.transcriptBoxTop}>
            <div>
              <h3 className={styles.transcriptTitle}>Official Transcript</h3>
              <p className={styles.transcriptBody}>Request a certified copy of your academic records for applications and verification.</p>
            </div>
            {transcriptStatus === 'pending' ? (
              <span className={styles.transcriptPending}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                Request pending
              </span>
            ) : transcriptStatus === 'approved' ? (
              <span className={styles.transcriptApproved}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                Approved — download from school
              </span>
            ) : (
              <button
                className={`btn btn-primary ${styles.transcriptBtn}`}
                onClick={requestTranscript}
                disabled={requestingTranscript}
              >
                {requestingTranscript
                  ? <><span className={styles.tSpinner} />Requesting…</>
                  : <>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                      Request Transcript
                    </>
                }
              </button>
            )}
          </div>
          {transcriptError && (
            <p className={styles.transcriptError}>{transcriptError}</p>
          )}
        </div>

        {/* Tabs */}
        <div className={styles.tabBar} role="tablist">
          <button role="tab" aria-selected={activeTab==='results'}
            className={`${styles.tab} ${activeTab==='results'?styles.tabActive:''}`}
            onClick={() => setActiveTab('results')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Results
            {results.length > 0 && <span className={`${styles.tabBadge} ${activeTab==='results'?styles.tabBadgeActive:''}`}>{results.length}</span>}
          </button>
          <button role="tab" aria-selected={activeTab==='fees'}
            className={`${styles.tab} ${activeTab==='fees'?styles.tabActive:''}`}
            onClick={() => setActiveTab('fees')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
            Fee Receipts
            {receipts.length > 0 && <span className={`${styles.tabBadge} ${activeTab==='fees'?styles.tabBadgeActive:''}`}>{receipts.length}</span>}
          </button>
        </div>

        {/* Results tab */}
        {activeTab === 'results' && (
          <div role="tabpanel">
            {results.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
                </div>
                <p className={styles.emptyTitle}>No results on record</p>
              </div>
            ) : (
              Object.entries(grouped).map(([groupKey, groupResults], gi) => (
                <section key={groupKey} className={styles.resultGroup}>
                  <h3 className={styles.resultGroupTitle}>{groupKey}</h3>
                  <div className={styles.resultList}>
                    {groupResults.map((r, i) => (
                      <div
                        key={r.id}
                        className={`glass-card ${styles.resultCard} animate-fade-up`}
                        style={{ animationDelay:`${(gi*5+i)*35}ms`, opacity:0 }}
                      >
                        <div className={styles.resultSubjectRow}>
                          <span className={styles.resultSubject}>{r.subject}</span>
                          <span className={styles.resultClass}>{r.class_name}</span>
                        </div>
                        <div className={styles.resultScoreRow}>
                          <span className={styles.resultScore} style={{ color: gradeColor(r.grade) }}>
                            {r.score}<span className={styles.resultScoreMax}>/100</span>
                          </span>
                          <span
                            className={styles.resultGrade}
                            style={{ background: gradeColorSubtle(r.grade), color: gradeColor(r.grade) }}
                          >
                            Grade {r.grade}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}

        {/* Fees tab */}
        {activeTab === 'fees' && (
          <div role="tabpanel">
            {receipts.length === 0 ? (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>
                  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>
                </div>
                <p className={styles.emptyTitle}>No fee receipts on record</p>
              </div>
            ) : (
              <div className={styles.receiptList}>
                {receipts.map((r, i) => (
                  <div
                    key={r.id}
                    className={`glass-card ${styles.receiptCard} animate-fade-up`}
                    style={{ animationDelay:`${i*40}ms`, opacity:0 }}
                  >
                    <div className={styles.receiptIcon}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    </div>
                    <div className={styles.receiptInfo}>
                      <span className={styles.receiptAmt}>{fmtNGN(r.amount_ngn)}</span>
                      <span className={styles.receiptMeta}>{r.description} · {fmtDate(r.paid_at)}</span>
                      <span className={styles.receiptNo}>Receipt #{r.receipt_number}</span>
                    </div>
                    {r.receipt_url && (
                      <a
                        href={r.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.receiptDownload}
                        download
                        aria-label="Download receipt"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={styles.spacer} />
    </RolePageWrapper>
  )
}
