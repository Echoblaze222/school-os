'use client'
// src/app/dashboard/principal/students/promote/PromoteClient.tsx
//
// Two destinations for a batch of students:
//   1. "Promote to class" - move to another (non-terminal) class, same school year cycle.
//   2. "Graduate to Alumni" - move out of the class list entirely: writes a graduation_records
//      row per student, flips student_profiles.lifecycle_stage to 'graduated', and stamps
//      graduation_year. These students then show up on the Alumni page instead of a class roster.
//
// Classes whose label looks like a terminal class (SSS3, JSS3-leaver streams, Year 13, Grade 12…)
// are flagged so the "Graduate" option is suggested automatically, but the principal can pick
// either path for any class - schools name their final year differently.

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { SupabaseClient } from '@supabase/supabase-js'
import RoleNav from '@/components/RoleNav'
import styles from './promote.module.css'
import { GraduationCapIcon, BookIcon, CheckIcon } from '@/components/Icons'

interface ClassOption { id: string; label: string; likelyFinal: boolean }
interface StudentRow  { id: string; full_name: string; admission_number: string; selected: boolean }

// Class labels that commonly mark the last year of a school (Nigerian + common intl systems).
const FINAL_CLASS_HINTS = ['sss3', 'ss3', 'year 13', 'y13', 'grade 12', 'g12', 'sixth form upper']

function looksFinal(label: string) {
  const l = label.toLowerCase()
  return FINAL_CLASS_HINTS.some(hint => l.includes(hint))
}

interface Props {
  userId: string; profile: any; school: any
  role: string; schoolId: string; schoolColor?: string
}

export default function PromoteClient({ userId, profile, school, role, schoolId, schoolColor }: Props) {
  const router = useRouter()
  const [supabase] = useState<SupabaseClient>(() => createClient())

  const [classes,   setClasses]   = useState<ClassOption[]>([])
  const [fromClass, setFromClass] = useState('')
  const [toClass,   setToClass]   = useState('')
  const [destination, setDestination] = useState<'promote' | 'graduate'>('promote')
  const [graduationYear, setGraduationYear] = useState(() => String(new Date().getFullYear()))

  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading,   setLoading]   = useState(false)
  const [promoting, setPromoting] = useState(false)
  const [result, setResult] = useState<{ count: number; mode: 'promote' | 'graduate' } | null>(null)
  const [error,  setError]  = useState<string | null>(null)

  useEffect(() => { loadClasses() }, [])

  async function loadClasses() {
    const { data } = await supabase
      .from('classes')
      .select('id, name, level, section, academic_year')
      .eq('school_id', schoolId)
      .order('level').order('section')

    const options: ClassOption[] = (data ?? []).map(c => {
      const label = c.name ?? `${c.level ?? ''}${c.section ?? ''} (${c.academic_year ?? ''})`
      return { id: c.id, label, likelyFinal: looksFinal(label) }
    })
    setClasses(options)
  }

  async function loadStudents(classId: string) {
    setLoading(true)
    setStudents([])

    // No nested select across student_profiles -> profiles (no FK for Supabase to resolve).
    // Fetch student_profiles for the class, then fetch matching profiles separately and merge.
    const { data: spRows } = await supabase
      .from('student_profiles')
      .select('id, admission_number')
      .eq('class_id', classId)

    const ids = (spRows ?? []).map(s => s.id)
    let namesById: Record<string, string> = {}

    if (ids.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', ids)
      namesById = Object.fromEntries((profileRows ?? []).map(p => [p.id, p.full_name]))
    }

    setStudents((spRows ?? []).map(s => ({
      id: s.id,
      full_name: namesById[s.id] ?? 'N/A',
      admission_number: s.admission_number,
      selected: true,
    })))
    setLoading(false)
  }

  function handleFromChange(classId: string) {
    setFromClass(classId)
    setToClass('')
    if (classId) {
      loadStudents(classId)
      const cls = classes.find(c => c.id === classId)
      setDestination(cls?.likelyFinal ? 'graduate' : 'promote')
    } else {
      setStudents([])
    }
  }

  function toggleAll(checked: boolean) {
    setStudents(prev => prev.map(s => ({ ...s, selected: checked })))
  }
  function toggleOne(id: string) {
    setStudents(prev => prev.map(s => s.id === id ? { ...s, selected: !s.selected } : s))
  }

  const selectedCount = students.filter(s => s.selected).length
  const canSubmit = selectedCount > 0 && (destination === 'graduate' || !!toClass) && !promoting

  async function handleSubmit() {
    const selected = students.filter(s => s.selected)
    if (selected.length === 0) return
    if (destination === 'promote' && !toClass) return

    setPromoting(true)
    setError(null)

    const { data: me } = await supabase.auth.getUser()
    if (!me.user) { setPromoting(false); return }

    if (destination === 'graduate') {
      const finalClassLabel = classes.find(c => c.id === fromClass)?.label ?? 'Final Class'
      const year = parseInt(graduationYear, 10) || new Date().getFullYear()

      const gradRecords = selected.map(s => ({
        student_id: s.id,
        school_id: schoolId,
        graduation_year: year,
        final_class: finalClassLabel,
        graduated_by: me.user!.id,
      }))
      const { error: gradErr } = await supabase.from('graduation_records').insert(gradRecords)

      const updates = selected.map(s =>
        supabase.from('student_profiles').update({
          lifecycle_stage:  'graduated',
          graduation_year:  year,
          promoted_by:      me.user!.id,
          promoted_at:      new Date().toISOString(),
        }).eq('id', s.id)
      )
      const results = await Promise.all(updates)
      const failed  = results.filter(r => r.error)

      if (gradErr || failed.length > 0) {
        setError(`${failed.length || selected.length} student(s) failed to graduate. Please retry.`)
        setPromoting(false)
        return
      }

      const notifications = selected.map(s => ({
        user_id: s.id,
        type: 'system_alert' as const,
        title: 'Congratulations, graduate!',
        body: `You have officially graduated from ${finalClassLabel}. Welcome to the alumni network!`,
      }))
      await supabase.from('notifications').insert(notifications)

      setResult({ count: selected.length - failed.length, mode: 'graduate' })
    } else {
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
        setError(`${failed.length} student(s) failed to promote. Please retry.`)
        setPromoting(false)
        return
      }

      const toLabel = classes.find(c => c.id === toClass)?.label ?? 'your new class'
      const notifications = selected.map(s => ({
        user_id: s.id,
        type: 'system_alert' as const,
        title: 'You have been promoted!',
        body: `Congratulations! You have been promoted to ${toLabel}.`,
      }))
      await supabase.from('notifications').insert(notifications)

      setResult({ count: selected.length - failed.length, mode: 'promote' })
    }

    setPromoting(false)
  }

  function reset() {
    setResult(null)
    setStudents([])
    setFromClass('')
    setToClass('')
    setError(null)
  }

  const toClassOptions = useMemo(
    () => classes.filter(c => c.id !== fromClass),
    [classes, fromClass]
  )
  const currentFromClass = classes.find(c => c.id === fromClass)

  return (
    <div className={styles.page}>
      <div className={styles.orb} aria-hidden />

      <header className={styles.header}>
        <button className={`${styles.backBtn} pressable`} onClick={() => router.push('/dashboard/principal/students')} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>Promote Students</h1>
          <p className={styles.headerSub}>Move students up a class or graduate them to alumni</p>
        </div>
        <div style={{ width: 40 }} />
      </header>

      <main className={styles.main}>
        {result ? (
          <div className={styles.successBox}>
            <div className={`${styles.successIcon} ${result.mode === 'graduate' ? styles.successIconGraduate : ''}`}>
              {result.mode === 'graduate' ? <GraduationCapIcon size={28} /> : <BookIcon size={28} />}
            </div>
            <p className={styles.successTitle}>
              {result.count} student{result.count !== 1 ? 's' : ''} {result.mode === 'graduate' ? 'graduated' : 'promoted'}!
            </p>
            <p className={styles.successSub}>
              {result.mode === 'graduate'
                ? 'They have been moved to alumni status and notified.'
                : 'Each student has been notified of their promotion.'}
            </p>
            <div className={styles.successActions}>
              <button className={`${styles.resetBtn} pressable`} onClick={reset}>Do another batch</button>
              {result.mode === 'graduate' && (
                <Link href="/dashboard/principal/alumni" className={styles.viewAlumniBtn}>View Alumni</Link>
              )}
            </div>
          </div>
        ) : (
          <>
            <div className={styles.card}>
              <h2 className={styles.cardTitle}>1. Select the class</h2>
              <p className={styles.cardHint}>Choose the class whose students you want to move.</p>
              <div className={styles.formField}>
                <label className={styles.label}>From class</label>
                <select
                  className={styles.select}
                  value={fromClass}
                  onChange={e => handleFromChange(e.target.value)}
                >
                  <option value="">Select class…</option>
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.label}{c.likelyFinal ? ', final year' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {fromClass && (
              <div className={styles.card}>
                <h2 className={styles.cardTitle}>2. Choose what happens next</h2>
                <p className={styles.cardHint}>
                  {currentFromClass?.likelyFinal
                    ? `${currentFromClass.label} looks like a final-year class. Graduating is suggested, but you can still promote to another class if needed.`
                    : 'Promote to the next class, or graduate these students out to alumni.'}
                </p>

                <div className={styles.destToggle}>
                  <button
                    type="button"
                    className={`${styles.destOption} ${destination === 'promote' ? styles.destOptionActive : ''} pressable`}
                    onClick={() => setDestination('promote')}
                  >
                    <span className={styles.destIcon}><BookIcon size={20} /></span>
                    <span className={styles.destLabel}>Promote to class</span>
                    <span className={styles.destSub}>Move up within the school</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.destOption} ${destination === 'graduate' ? styles.destOptionActive : ''} pressable`}
                    onClick={() => setDestination('graduate')}
                  >
                    <span className={styles.destIcon}><GraduationCapIcon size={20} /></span>
                    <span className={styles.destLabel}>Graduate to Alumni</span>
                    <span className={styles.destSub}>Ends their enrollment</span>
                  </button>
                </div>

                {destination === 'promote' ? (
                  <div className={styles.classRow}>
                    <div className={styles.formField}>
                      <label className={styles.label}>To class</label>
                      <select className={styles.select} value={toClass} onChange={e => setToClass(e.target.value)}>
                        <option value="">Select class…</option>
                        {toClassOptions.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className={styles.classRow}>
                    <div className={styles.formField}>
                      <label className={styles.label}>Graduation year</label>
                      <select className={styles.select} value={graduationYear} onChange={e => setGraduationYear(e.target.value)}>
                        {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 1 + i).map(y => (
                          <option key={y} value={y}>{y}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            )}

            {loading && <p className={styles.loadingText}>Loading students…</p>}

            {!loading && fromClass && students.length === 0 && (
              <p className={styles.emptyText}>No students found in this class.</p>
            )}

            {students.length > 0 && (
              <div className={styles.card}>
                <div className={styles.studentHeader}>
                  <h2 className={styles.cardTitle}>3. Select students ({students.length})</h2>
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
                      {s.selected && <span className={styles.selectedCheck}><CheckIcon size={14} /></span>}
                    </label>
                  ))}
                </div>

                {error && <p className={styles.errorMsg}>{error}</p>}

                <div className={styles.summaryBar}>
                  <span>
                    <span className={styles.summaryCount}>{selectedCount}</span> of {students.length} selected
                  </span>
                  <span>{destination === 'graduate' ? `→ Alumni (${graduationYear})` : toClass ? `→ ${toClassOptions.find(c => c.id === toClass)?.label}` : '→ choose a class'}</span>
                </div>

                <button
                  className={`${styles.actionBtn} ${destination === 'graduate' ? styles.actionBtnGraduate : ''} pressable`}
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                >
                  {promoting
                    ? <><span className={styles.spinner} /> {destination === 'graduate' ? 'Graduating…' : 'Promoting…'}</>
                    : destination === 'graduate'
                      ? <><GraduationCapIcon size={16} /> Graduate {selectedCount} Student{selectedCount !== 1 ? 's' : ''} to Alumni</>
                      : <><BookIcon size={16} /> Promote {selectedCount} Student{selectedCount !== 1 ? 's' : ''}</>}
                </button>
              </div>
            )}
          </>
        )}
      </main>

      <RoleNav
        userId={userId}
        profile={profile}
        school={school}
        role={role}
        schoolColor={schoolColor}
      />
    </div>
  )
}
