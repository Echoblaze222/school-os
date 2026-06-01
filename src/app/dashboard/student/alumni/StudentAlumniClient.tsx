'use client'

// src/app/dashboard/student/alumni/StudentAlumniClient.tsx

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import styles from './alumni-student.module.css'
import type { AlumniProfile, AlumniResult, AlumniReceipt } from './types'

interface Props {
  studentId:        string
  profile:          AlumniProfile
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
  return 'var(--error)'
}

export default function StudentAlumniClient({ studentId, profile, results, receipts, transcriptStatus: initialStatus }: Props) {
  const router   = useRouter()
  const supabase = createClient()

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
    <div className={styles.page}>
      <div className={styles.orb1} aria-hidden />

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/student')} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>My Records</h1>
          <p className={styles.headerSub}>Alumni archive</p>
        </div>
        <button className={styles.themeBtn} aria-label="Toggle theme"
          onClick={() => { const c=document.documentElement.getAttribute('data-theme')??'dark';const n=c==='dark'?'light':'dark';document.documentElement.setAttribute('data-theme',n);localStorage.setItem('schoolos_theme',n) }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
        </button>
      </header>

      {/* Hero banner */}
      <div className={styles.heroBanner}>
        <div className={styles.heroAvatarWrap}>
          {profile.avatar_url
            ? <img src={profile.avatar_url} alt={profile.full_name} className={styles.heroAvatarImg} />
            : <span className={styles.heroAvatarText}>{initials(profile.full_name)}</span>
          }
          <div className={styles.heroCapBadge}>🎓</div>
        </div>
        <div className={styles.heroInfo}>
          <h2 className={styles.heroName}>{profile.full_name}</h2>
          <p className={styles.heroSub}>{profile.class_name} · Class of {profile.graduation_year ?? '—'}</p>
          <div className={styles.heroBadgeRow}>
            <span className={styles.heroBadge}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
              {profile.admission_number}
            </span>
            <span className={styles.heroBadge} style={{ background:'var(--burgundy-subtle)', color:'var(--text-accent)', borderColor:'rgba(128,0,32,0.25)' }}>
              ⭐ {profile.lifecycle_stage === 'graduated' ? 'Graduated' : 'Alumni'}
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
        <main className={styles.main} role="tabpanel">
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
                          style={{ background: gradeColor(r.grade)+'1A', color: gradeColor(r.grade) }}
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
        </main>
      )}

      {/* Fees tab */}
      {activeTab === 'fees' && (
        <main className={styles.main} role="tabpanel">
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
        </main>
      )}

      {/* Bottom Nav */}
      <nav className="bottom-nav" aria-label="Student navigation">
        <Link href="/dashboard/student" className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </Link>
        <Link href="/dashboard/student/records" className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
          <span>Records</span>
        </Link>
        <Link href="/dashboard/student" className="nav-home" aria-label="Dashboard">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
        </Link>
        <Link href="/dashboard/student/alumni" className="nav-item active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          <span>Alumni</span>
        </Link>
        <Link href="/dashboard/student/id-card" className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
          <span>ID Card</span>
        </Link>
      </nav>
    </div>
  )
}
