'use client'
// src/app/dashboard/principal/students/promote/page.tsx

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './promote.module.css'

interface ClassOption { id: string; label: string }
interface StudentRow  { id: string; full_name: string; admission_number: string; selected: boolean }

export default function PromotePage() {
  const router = useRouter()
  const supabase = createClient()

  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [fromClass, setFromClass] = useState('')
  const [toClass, setToClass] = useState('')
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [result, setResult] = useState<{ count: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('schoolos_theme') as 'light' | 'dark' | null
    if (t) { setTheme(t); document.documentElement.setAttribute('data-theme', t) }
    loadClasses()
  }, [])

  async function loadClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, level, section, academic_year')
      .order('level').order('section')
    setClasses((data ?? []).map(c => ({
      id:    c.id,
      label: `${c.level}${c.section} (${c.academic_year})`,
    })))
  }

  async function loadStudents(classId: string) {
    setLoading(true)
    const { data } = await supabase
      .from('student_profiles')
      .select('id, admission_number, profiles!inner(full_name)')
      .eq('class_id', classId)
    setStudents((data ?? []).map((s: any) => ({
      id:               s.id,
      full_name:        s.profiles?.full_name ?? '—',
      admission_number: s.admission_number,
      selected:         true,
    })))
    setLoading(false)
  }

  function toggleAll(checked: boolean) {
    setStudents(prev => prev.map(s => ({ ...s, selected: checked })))
  }

  function toggleOne(id: string) {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s))
  }

  async function handlePromote() {
    const selected = students.filter(s => s.selected)
    if (!toClass || selected.length === 0) return
    setPromoting(true)
    setError(null)

    const { data: me } = await supabase.auth.getUser()
    if (!me.user) return

    const updates = selected.map(s =>
      supabase.from('student_profiles').update({
        class_id:    toClass,
        promoted_by: me.user!.id,
        promoted_at: new Date().toISOString(),
      }).eq('id', s.id)
    )

    const results = await Promise.all(updates)
    const failed  = results.filter(r => r.error)

    if (failed.length > 0) {
      setError(`${failed.length} student(s) failed to promote.`)
    }

    const notifications = selected.map(s => ({
      user_id: s.id,
      type:    'system_alert' as const,
      title:   'You have been promoted!',
      body:    `Congratulations! You have been promoted to your new class.`,
    }))
    await supabase.from('notifications').insert(notifications)

    setResult({ count: selected.length - failed.length })
    setPromoting(false)
  }

  const selectedCount = students.filter(s => s.selected).length

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/principal')}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <h1 className={styles.headerTitle}>Promote Students</h1>
        <button className={styles.themeBtn} onClick={() => {
          const next = theme === 'light' ? 'dark' : 'light'
          setTheme(next); localStorage.setItem('schoolos_theme', next)
          document.documentElement.setAttribute('data-theme', next)
        }}>{theme === 'light' ? '🌙' : '☀️'}</button>
      </header>

      <main className={styles.main}>
        {result ? (
          <div className={styles.successBox}>
            <p className={styles.successIcon}>🎓</p>
            <p className={styles.successTitle}>{result.count} students promoted!</p>
            <p className={styles.successSub}>Each student has been notified of their promotion.</p>
            <button className={styles.resetBtn} onClick={() => { setResult(null); setStudents([]) }}>Promote more</button>
          </div>
        ) : (
          <>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>Select Classes</h2>
              <div className={styles.classRow}>
                <div className={styles.formField}>
                  <label className={styles.label}>From Class</label>
                  <select className={styles.select} value={fromClass} onChange={e => {
                    setFromClass(e.target.value)
                    if (e.target.value) loadStudents(e.target.value)
                    else setStudents([])
                  }}>
                    <option value="">Select class...</option>
                    {classes.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div className={styles.arrow}>→</div>
                <div className={styles.formField}>
                  <label className={styles.label}>To Class</label>
                  <select className={styles.select} value={toClass} onChange={e => setToClass(e.target.value)}>
                    <option value="">Select class...</option>
                    {classes.filter(c => c.id !== fromClass).map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {loading && <p className={styles.loadingText}>Loading students...</p>}

            {students.length > 0 && (
              <div className={styles.card}>
                <div className={styles.studentHeader}>
                  <h2 className={styles.cardTitle}>{students.length} Students</h2>
                  <div className={styles.selectAll}>
                    <input
                      type="checkbox"
                      id="select-all"
                      checked={students.every(s => s.selected)}
                      onChange={e => toggleAll(e.target.checked)}
                      className={styles.checkbox}
                    />
                    <label htmlFor="select-all" className={styles.selectAllLabel}>Select all</label>
                  </div>
                </div>

                <div className={styles.studentList}>
                  {students.map(s => (
                    <label key={s.id} className={`${styles.studentRow} ${s.selected ? styles.studentRowSelected : ''}`}>
                      <input type="checkbox" checked={s.selected} onChange={() => toggleOne(s.id)} className={styles.checkbox} />
                      <div className={styles.studentInfo}>
                        <p className={styles.studentName}>{s.full_name}</p>
                        <p className={styles.studentAdm}>{s.admission_number}</p>
                      </div>
                      {s.selected && <span className={styles.selectedCheck}>✓</span>}
                    </label>
                  ))}
                </div>

                {error && <p className={styles.errorMsg}>{error}</p>}

                <button
                  className={styles.promoteBtn}
                  onClick={handlePromote}
                  disabled={promoting || selectedCount === 0 || !toClass}
                >
                  {promoting ? <><span className={styles.spinner}/> Promoting...</> : `🎓 Promote ${selectedCount} Student${selectedCount !== 1 ? 's' : ''}`}
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}