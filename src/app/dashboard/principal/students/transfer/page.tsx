'use client'
// src/app/dashboard/principal/students/transfer/page.tsx

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './transfer.module.css'

interface Student { id: string; full_name: string; admission_number: string; class_label: string; outstanding_fees: number }
interface School   { id: string; name: string; city: string }

function TransferPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [studentSearch, setStudentSearch] = useState('')
  const [studentResults, setStudentResults] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null)
  const [preselected, setPreselected] = useState(false)
  const [schoolSearch, setSchoolSearch] = useState('')
  const [schoolResults, setSchoolResults] = useState<School[]>([])
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [transferring, setTransferring] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mySchoolId, setMySchoolId] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('schoolos_theme') as 'light' | 'dark' | null
    if (t) { setTheme(t); document.documentElement.setAttribute('data-theme', t) }
    loadMySchool()
  }, [])

  async function loadMySchool() {
    const { data: me } = await supabase.auth.getUser()
    if (!me.user) return
    const { data: p } = await supabase.from('profiles').select('school_id').eq('id', me.user.id).single()
    const schoolId = (p as any)?.school_id ?? null
    setMySchoolId(schoolId)

    // Coming from the Students page with a specific student already chosen —
    // load them directly instead of making the principal search again.
    const studentId = searchParams.get('studentId')
    if (studentId) await loadStudentById(studentId)
  }

  async function loadStudentById(studentId: string) {
    const { data: p } = await supabase
      .from('profiles')
      .select(`id, full_name, student_profiles ( admission_number, classes ( level, section ) )`)
      .eq('id', studentId)
      .single()
    if (!p) return
    const sp = (p as any).student_profiles
    const { data: inv } = await supabase
      .from('payment_invoices')
      .select('balance_ngn')
      .eq('student_id', p.id)
      .in('status', ['pending', 'partial', 'overdue'])
    const fees = (inv ?? []).reduce((s: number, i: any) => s + (i.balance_ngn ?? 0), 0)
    setSelectedStudent({
      id: p.id, full_name: p.full_name,
      admission_number: sp?.admission_number ?? '—',
      class_label: sp?.classes ? `${sp.classes.level}${sp.classes.section}` : '—',
      outstanding_fees: fees,
    })
    setPreselected(true)
  }

  async function searchStudents() {
    if (!studentSearch.trim()) return
    const { data } = await supabase
      .from('profiles')
      .select(`
        id, full_name,
        student_profiles (
          admission_number,
          classes ( level, section )
        )
      `)
      .eq('role', 'student')
      .eq('school_id', mySchoolId ?? '') // only students enrolled in this school can be transferred
      .ilike('full_name', `%${studentSearch}%`)
      .limit(10)

    const students: Student[] = []
    for (const p of data ?? []) {
      const sp = (p as any).student_profiles
      // Get outstanding fees
      const { data: inv } = await supabase
        .from('payment_invoices')
        .select('balance_ngn')
        .eq('student_id', p.id)
        .in('status', ['pending', 'partial', 'overdue'])
      const fees = (inv ?? []).reduce((s: number, i: any) => s + (i.balance_ngn ?? 0), 0)
      students.push({
        id:               p.id,
        full_name:        p.full_name,
        admission_number: sp?.admission_number ?? '—',
        class_label:      sp?.classes ? `${sp.classes.level}${sp.classes.section}` : '—',
        outstanding_fees: fees,
      })
    }
    setStudentResults(students)
  }

  async function searchSchools() {
    if (!schoolSearch.trim()) return
    const { data } = await supabase
      .from('schools')
      .select('id, name, city')
      .ilike('name', `%${schoolSearch}%`)
      .eq('status', 'active')
      .neq('id', mySchoolId ?? '')
      .limit(10)
    setSchoolResults(data ?? [])
  }

  async function initiateTransfer() {
    if (!selectedStudent || !selectedSchool) return
    setTransferring(true)
    setError(null)

    const { data: me } = await supabase.auth.getUser()
    if (!me.user) return

    const { error: err } = await supabase.from('student_transfers').insert({
      student_id:            selectedStudent.id,
      origin_school_id:      mySchoolId,
      destination_school_id: selectedSchool.id,
      initiated_by:          me.user.id,
      status:                'requested',
      debt_acknowledged:     acknowledged,
    })

    if (err) {
      setError(err.message)
    } else {
      setSuccess(true)
    }
    setTransferring(false)
  }

  const hasDebt = (selectedStudent?.outstanding_fees ?? 0) > 0

  if (success) {
    return (
      <div className={styles.page}>
        <header className={styles.header}>
          <button className={styles.backBtn} onClick={() => router.push('/dashboard/principal')}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
          </button>
          <h1 className={styles.headerTitle}>Transfer Initiated</h1>
          <div style={{ width: 36 }} />
        </header>
        <div className={styles.successBox}>
          <p className={styles.successIcon}>✈️</p>
          <p className={styles.successTitle}>Transfer Initiated</p>
          <p className={styles.successSub}>
            The Principal of <strong>{selectedSchool?.name}</strong> has been notified.
            Once they approve, the transfer will be completed automatically.
          </p>
          <button className={styles.resetBtn} onClick={() => { setSuccess(false); setSelectedStudent(null); setSelectedSchool(null); setPreselected(false) }}>
            New Transfer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/principal')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 className={styles.headerTitle}>Transfer Student</h1>
        <button className={styles.themeBtn} onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light'
          setTheme(next); localStorage.setItem('schoolos_theme', next)
          document.documentElement.setAttribute('data-theme', next)
        }}>{theme === 'light' ? '🌙' : '☀️'}</button>
      </header>

      <main className={styles.main}>
        {/* Step 1: Search student — skipped if we arrived with a student already chosen */}
        {!preselected && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Step 1 — Find Student</h2>
            <div className={styles.searchRow}>
              <input className={styles.input} placeholder="Search by student name..." value={studentSearch} onChange={e => setStudentSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchStudents()} />
              <button className={styles.searchBtn} onClick={searchStudents}>Search</button>
            </div>
            {studentResults.map(s => (
              <button key={s.id} className={`${styles.resultRow} ${selectedStudent?.id === s.id ? styles.resultRowActive : ''}`} onClick={() => setSelectedStudent(s)}>
                <div>
                  <p className={styles.resultName}>{s.full_name}</p>
                  <p className={styles.resultMeta}>{s.class_label} · {s.admission_number}</p>
                </div>
                {s.outstanding_fees > 0 && (
                  <span className={styles.debtBadge}>₦{s.outstanding_fees.toLocaleString()} owed</span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Student profile + fee warning */}
        {selectedStudent && (
          <div className={`${styles.card} ${hasDebt ? styles.cardWarning : ''}`}>
            <h2 className={styles.cardTitle}>Selected Student</h2>
            <p className={styles.profileName}>{selectedStudent.full_name}</p>
            <p className={styles.profileMeta}>{selectedStudent.class_label} · {selectedStudent.admission_number}</p>
            {preselected && (
              <button
                onClick={() => { setPreselected(false); setSelectedStudent(null); setStudentResults([]); setAcknowledged(false) }}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--color-brand)', fontSize: 'var(--font-size-xs)', fontWeight: 700, cursor: 'pointer', marginBottom: 'var(--space-2)' }}
              >
                Change student
              </button>
            )}
            {hasDebt && (
              <div className={styles.warningBox}>
                <p className={styles.warningTitle}>⚠️ Outstanding Fees</p>
                <p className={styles.warningText}>
                  This student has ₦{selectedStudent.outstanding_fees.toLocaleString()} in unpaid fees.
                  You must acknowledge this debt before initiating transfer.
                </p>
                <label className={styles.ackRow}>
                  <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} className={styles.checkbox} />
                  <span className={styles.ackLabel}>I acknowledge the outstanding debt will follow this student to the new school</span>
                </label>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Search destination school */}
        {selectedStudent && (!hasDebt || acknowledged) && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Step 2 — Destination School</h2>
            <div className={styles.searchRow}>
              <input className={styles.input} placeholder="Search school by name..." value={schoolSearch} onChange={e => setSchoolSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchSchools()} />
              <button className={styles.searchBtn} onClick={searchSchools}>Search</button>
            </div>
            {schoolResults.map(s => (
              <button key={s.id} className={`${styles.resultRow} ${selectedSchool?.id === s.id ? styles.resultRowActive : ''}`} onClick={() => setSelectedSchool(s)}>
                <div>
                  <p className={styles.resultName}>{s.name}</p>
                  <p className={styles.resultMeta}>{s.city}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Confirm */}
        {selectedStudent && selectedSchool && (!hasDebt || acknowledged) && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Confirm Transfer</h2>
            <p className={styles.confirmText}>
              <strong>{selectedStudent.full_name}</strong> → <strong>{selectedSchool.name}</strong>
            </p>
            <p className={styles.confirmSub}>The destination school principal will need to approve this transfer.</p>
            {error && <p className={styles.errorMsg}>{error}</p>}
            <button className={styles.transferBtn} onClick={initiateTransfer} disabled={transferring}>
              {transferring ? <><span className={styles.spinner}/> Initiating...</> : '✈️ Initiate Transfer'}
            </button>
          </div>
        )}
      </main>
    </div>
  )
}

export default function TransferPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <TransferPageContent />
    </Suspense>
  )
}
