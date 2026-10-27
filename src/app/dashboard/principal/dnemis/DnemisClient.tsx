'use client'

// Learner ID (LIN) + D-NEMIS readiness. Reuses the Students page styles so it
// looks native; all data goes through /api/principal/dnemis.

import { useCallback, useEffect, useMemo, useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import KpiCard from '@/components/KpiCard'
import { PRINCIPAL_FEATURE_GROUPS } from '../featureGroups'
import { CheckIcon, XIcon, GraduationCapIcon, AlertIcon } from '@/components/Icons'
import styles from '../students/students.module.css'

interface Props { profile: any; school: any; userId: string }

interface StudentRow {
  id: string
  full_name: string
  class_level: string | null
  admission_number: string | null
  lin: string | null
}

interface Summary { total: number; withLin: number; missingLin: number; readinessPct: number }

export default function DnemisClient({ profile, school, userId }: Props) {
  const sc = school?.primary_color ?? '#800020'

  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [summary, setSummary] = useState<Summary>({ total: 0, withLin: 0, missingLin: 0, readinessPct: 0 })
  const [schoolId10, setSchoolId10] = useState('')
  const [savedSchoolId, setSavedSchoolId] = useState('')
  const [savingSchoolId, setSavingSchoolId] = useState(false)

  const [search, setSearch] = useState('')
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)

  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importErrors, setImportErrors] = useState<string[]>([])

  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3500)
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/principal/dnemis', { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) { setProblem(json.error ?? 'Could not load'); setLoading(false); return }
      setProblem(null)
      setStudents(json.students ?? [])
      setSummary(json.summary)
      const id = json.school?.dnemis_school_id ?? ''
      setSchoolId10(id)
      setSavedSchoolId(id)
    } catch {
      setProblem('Network error. Check your connection and try again.')
    }
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function saveSchoolId() {
    setSavingSchoolId(true)
    const res = await fetch('/api/principal/dnemis', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dnemis_school_id: schoolId10 }),
    })
    const json = await res.json().catch(() => ({}))
    setSavingSchoolId(false)
    if (!res.ok) { showToast(json.error ?? 'Could not save', false); return }
    setSavedSchoolId(json.dnemis_school_id ?? '')
    showToast('School ID saved')
  }

  async function saveOne(s: StudentRow) {
    const lin = (drafts[s.id] ?? '').trim()
    if (!lin) return
    setSavingId(s.id)
    const res = await fetch('/api/principal/dnemis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updates: [{ student_id: s.id, lin }] }),
    })
    const json = await res.json().catch(() => ({}))
    setSavingId(null)
    if (!res.ok) { showToast(json.error ?? 'Could not save', false); return }
    if (json.failed?.length) { showToast(json.failed[0].reason, false); return }
    setDrafts(d => { const { [s.id]: _drop, ...rest } = d; return rest })
    showToast(`LIN saved for ${s.full_name}`)
    load()
  }

  async function runImport() {
    if (!importText.trim()) return
    setImporting(true)
    setImportErrors([])
    const res = await fetch('/api/principal/dnemis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ csv: importText }),
    })
    const json = await res.json().catch(() => ({}))
    setImporting(false)
    if (!res.ok) { showToast(json.error ?? 'Import failed', false); return }
    const failed: { key: string; reason: string }[] = json.failed ?? []
    setImportErrors(failed.map(f => (f.key ? `${f.key}: ${f.reason}` : f.reason)))
    showToast(`${json.updated} LIN${json.updated === 1 ? '' : 's'} saved${failed.length ? `, ${failed.length} skipped` : ''}`, failed.length === 0)
    if (json.updated > 0) { if (failed.length === 0) setImportText(''); load() }
  }

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter(s => {
      if (onlyMissing && s.lin) return false
      if (!q) return true
      return (
        s.full_name?.toLowerCase().includes(q) ||
        s.admission_number?.toLowerCase().includes(q) ||
        s.class_level?.toLowerCase().includes(q) ||
        s.lin?.toLowerCase().includes(q)
      )
    })
  }, [students, search, onlyMissing])

  return (
    <RoleSubHeader userId={userId} role="principal" profile={profile} school={school} title="LIN & D-NEMIS" featureGroups={PRINCIPAL_FEATURE_GROUPS}>
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? <CheckIcon size={14} /> : <XIcon size={14} />} {toast.msg}
        </div>
      )}

      <div className={styles.container}>
        {problem ? (
          <div className={styles.empty}>
            <AlertIcon size={32} />
            <p>{problem}</p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              The Learner Identification Number (LIN) is the permanent national ID for each student. Some states already require every school to upload learners, and students without a LIN can be barred from external exams.
            </p>

            <div className={styles.statsRow}>
              <KpiCard label="Students" value={summary.total} icon={<GraduationCapIcon size={16} />} />
              <KpiCard label="With LIN" value={summary.withLin} icon={<CheckIcon size={16} />} />
              <KpiCard label="Missing LIN" value={summary.missingLin} icon={<AlertIcon size={16} />} />
              <KpiCard label="Ready %" value={summary.readinessPct} icon={<GraduationCapIcon size={16} />} />
            </div>

            {/* School ID + export */}
            <div className={styles.formCard}>
              <p className={styles.formTitle}>School D-NEMIS ID</p>
              <div className={styles.formGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>10-digit school ID</label>
                  <input
                    className={styles.fieldInput}
                    inputMode="numeric"
                    maxLength={10}
                    placeholder="e.g. 1234567890"
                    value={schoolId10}
                    onChange={e => setSchoolId10(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>
              <div className={styles.formActions}>
                <button
                  className={`${styles.saveBtn} pressable`}
                  style={{ background: sc }}
                  onClick={saveSchoolId}
                  disabled={savingSchoolId || schoolId10 === savedSchoolId}
                >
                  {savingSchoolId ? 'Saving…' : 'Save school ID'}
                </button>
                <a
                  href="/api/principal/dnemis?format=csv"
                  className={`${styles.addBtn} pressable`}
                  style={{ background: sc, textDecoration: 'none' }}
                >
                  Download learner CSV
                </a>
              </div>
            </div>

            {/* Bulk import */}
            <div className={styles.toolbar}>
              <button className={`${styles.addBtn} pressable`} style={{ background: sc }} onClick={() => setShowImport(v => !v)}>
                {showImport ? <><XIcon size={14} /> Close</> : 'Import LINs'}
              </button>
              <div className={styles.searchWrap}>
                <input className={styles.searchInput} placeholder="Search name, class, admission no." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button
                className={`${styles.filterSelect} pressable`}
                style={{ cursor: 'pointer' }}
                onClick={() => setOnlyMissing(v => !v)}
              >
                {onlyMissing ? 'Showing: missing LIN' : 'Showing: all'}
              </button>
            </div>

            {showImport && (
              <div className={styles.formCard}>
                <p className={styles.formTitle}>Paste admission number and LIN</p>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                  One learner per line: admission number, then LIN. Copy two columns straight from a spreadsheet, or type them with a comma between.
                </p>
                <textarea
                  className={styles.fieldInput}
                  style={{ width: '100%', minHeight: 140, fontFamily: 'monospace' }}
                  placeholder={'ADM/2026/001,AB12-3456-7890\nADM/2026/002,AB12-3456-7891'}
                  value={importText}
                  onChange={e => setImportText(e.target.value)}
                />
                {importErrors.length > 0 && (
                  <ul style={{ fontSize: '0.75rem', color: '#EF4444', margin: '8px 0 0', paddingLeft: 18 }}>
                    {importErrors.slice(0, 20).map((e, i) => <li key={i}>{e}</li>)}
                    {importErrors.length > 20 && <li>…and {importErrors.length - 20} more</li>}
                  </ul>
                )}
                <div className={styles.formActions}>
                  <button className={`${styles.cancelFormBtn} pressable`} onClick={() => { setShowImport(false); setImportErrors([]) }}>Cancel</button>
                  <button className={`${styles.saveBtn} pressable`} style={{ background: sc }} onClick={runImport} disabled={importing || !importText.trim()}>
                    {importing ? 'Importing…' : 'Import'}
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            {loading ? (
              <div className={styles.loadingList}>
                {[1, 2, 3, 4].map(i => <div key={i} className={styles.skeleton} />)}
              </div>
            ) : visible.length === 0 ? (
              <div className={styles.empty}>
                <p>{onlyMissing && !search ? 'Every student has a LIN.' : 'No students match.'}</p>
              </div>
            ) : (
              <div className={`${styles.studentList} stagger`}>
                {visible.map(s => (
                  <div key={s.id} className={`${styles.studentRow} animate-fade-up`} style={{ flexWrap: 'wrap', gap: 8 }}>
                    <div className={styles.studentInfo} style={{ minWidth: 160 }}>
                      <p className={styles.studentName}>{s.full_name}</p>
                      <div className={styles.studentMeta}>
                        <span>{s.class_level ?? 'Unassigned'}</span>
                        {s.admission_number && <span>· {s.admission_number}</span>}
                        {s.lin && <span className={styles.codeTag}>{s.lin}</span>}
                      </div>
                    </div>
                    {!s.lin && (
                      <div style={{ display: 'flex', gap: 6, flex: 1, minWidth: 200 }}>
                        <input
                          className={styles.fieldInput}
                          style={{ flex: 1 }}
                          placeholder="Enter LIN"
                          value={drafts[s.id] ?? ''}
                          onChange={e => setDrafts(d => ({ ...d, [s.id]: e.target.value }))}
                        />
                        <button
                          className={`${styles.saveBtn} pressable`}
                          style={{ background: sc }}
                          onClick={() => saveOne(s)}
                          disabled={savingId === s.id || !(drafts[s.id] ?? '').trim()}
                        >
                          {savingId === s.id ? '…' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        <div style={{ height: 100 }} />
      </div>
    </RoleSubHeader>
  )
}
