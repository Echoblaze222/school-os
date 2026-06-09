'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/hooks/useRealtimeTable'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from './students.module.css'

const GENDER_OPTS = ['Male', 'Female', 'Other']

interface Props { profile: any; school: any; userId: string }

// ── Success modal shown after enrolment ─────────────────────
function EnrolSuccessModal({
  result, sc, onClose,
}: {
  result: { full_name: string; email: string; code: string; password: string }
  sc: string
  onClose: () => void
}) {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedPwd,  setCopiedPwd]  = useState(false)
  const [copiedAll,  setCopiedAll]  = useState(false)
  const initials = result.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  async function copy(text: string, which: 'code' | 'pwd' | 'all') {
    await navigator.clipboard.writeText(text).catch(() => {})
    if (which === 'code') { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000) }
    else if (which === 'pwd') { setCopiedPwd(true); setTimeout(() => setCopiedPwd(false), 2000) }
    else { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2500) }
  }

  function copyAllDetails() {
    const text = `Name: ${result.full_name}\nEmail: ${result.email}\nAccess Code: ${result.code}\nTemp Password: ${result.password}`
    copy(text, 'all')
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog} style={{ maxWidth: 440, width: '100%' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: '#10B98118',
            border: '2px solid #10B981', display: 'flex', alignItems: 'center',
            justifyContent: 'center', margin: '0 auto 12px',
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h3 className={styles.dialogTitle} style={{ marginBottom: 4 }}>Enrolment Complete!</h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>
            Share these login details with <strong style={{ color: 'var(--text-base)' }}>{result.full_name}</strong>
          </p>
        </div>

        {/* User badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          borderRadius: 10, marginBottom: 16,
        }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', background: sc + '22',
            color: sc, fontWeight: 700, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{initials}</div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-base)' }}>{result.full_name}</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>{result.email}</p>
          </div>
        </div>

        {/* Access Code */}
        <div style={{
          border: `1px solid ${sc}44`, background: sc + '0a',
          borderRadius: 10, padding: '12px 14px', marginBottom: 10,
        }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Access Code
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              flex: 1, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.08em',
              color: sc, fontFamily: 'monospace',
            }}>{result.code}</code>
            <button
              onClick={() => copy(result.code, 'code')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                background: copiedCode ? '#10B98122' : 'transparent',
                border: `1px solid ${copiedCode ? '#10B981' : sc + '55'}`,
                color: copiedCode ? '#10B981' : sc,
              }}
            >
              {copiedCode ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Temp Password */}
        <div style={{
          border: '1px solid #F59E0B44', background: '#F59E0B0a',
          borderRadius: 10, padding: '12px 14px', marginBottom: 16,
        }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Temporary Password
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              flex: 1, fontSize: '1rem', fontWeight: 700,
              color: '#F59E0B', fontFamily: 'monospace', letterSpacing: '0.05em',
            }}>{result.password}</code>
            <button
              onClick={() => copy(result.password, 'pwd')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                background: copiedPwd ? '#10B98122' : 'transparent',
                border: `1px solid ${copiedPwd ? '#10B981' : '#F59E0B55'}`,
                color: copiedPwd ? '#10B981' : '#F59E0B',
              }}
            >
              {copiedPwd ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#F59E0B', opacity: 0.85 }}>
            ⚠️ Student must change this password on first login.
          </p>
        </div>

        {/* Actions */}
        <button
          onClick={copyAllDetails}
          style={{
            width: '100%', padding: '10px', borderRadius: 8, marginBottom: 8,
            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            background: copiedAll ? '#10B98122' : 'var(--glass-bg)',
            border: `1px solid ${copiedAll ? '#10B981' : 'var(--glass-border)'}`,
            color: copiedAll ? '#10B981' : 'var(--text-base)',
          }}
        >
          {copiedAll ? '✓ All Details Copied' : 'Copy All Details'}
        </button>
        <button
          onClick={onClose}
          className={styles.saveBtn}
          style={{ width: '100%', background: sc }}
        >
          Done — Enrol Another
        </button>
      </div>
    </div>
  )
}

export default function StudentsClient({ profile, school, userId }: Props) {
  const supabase      = createClient()
  const sc            = school?.primary_color ?? '#7C3AED'

  // ── Realtime: students list stays live without any manual refresh ──────────
  const [students, setStudents] = useRealtimeTable<any>({
    table:   'profiles',
    filter:  school?.id ? `school_id=eq.${school.id}&role=eq.student` : undefined,
    initial: [],
    orderBy: (a, b) => a.full_name.localeCompare(b.full_name),
  })

  const [loading,     setLoading]     = useState(true)
  const [search,      setSearch]      = useState('')
  const [classFilter, setClassFilter] = useState('')
  const [classes,     setClasses]     = useState<any[]>([])
  const [showForm,    setShowForm]    = useState(false)
  const [confirmDel,  setConfirmDel]  = useState<any | null>(null)
  const [deleting,    setDeleting]    = useState<string | null>(null)
  const [toast,       setToast]       = useState<{ msg: string; ok: boolean } | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [enrollResult, setEnrollResult] = useState<{ full_name: string; email: string; code: string; password: string } | null>(null)
  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', date_of_birth: '',
    gender: '', class_id: '', admission_number: '', guardian_name: '', guardian_phone: '',
  })

  // Load students + classes on mount
  useEffect(() => {
    async function loadData() {
      if (!school?.id) { setLoading(false); return }
      const [clsRes, stuRes] = await Promise.all([
        supabase.from('classes').select('id, name, level, section').eq('school_id', school.id).order('name'),
        supabase.from('profiles').select('*').eq('school_id', school.id).eq('role', 'student').order('full_name'),
      ])
      if (clsRes.data) setClasses(clsRes.data)
      if (stuRes.data) setStudents(stuRes.data)
      setLoading(false)
    }
    loadData()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id])

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDelete(student: any) {
    setDeleting(student.id)
    const { error } = await supabase.from('profiles').delete().eq('id', student.id)
    setDeleting(null)
    setConfirmDel(null)
    if (error) { showToast('Failed to remove student', false); return }
    setStudents(prev => prev.filter(s => s.id !== student.id))
    showToast(`${student.full_name} removed`)
  }

  async function handleCreate() {
    if (!form.full_name.trim() || !form.email.trim()) {
      showToast('Full name and email are required.', false)
      return
    }
    setSaving(true)
    try {
      const res  = await fetch('/api/secretary/create-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fullName:        form.full_name.trim(),
          email:           form.email.trim().toLowerCase(),
          role:            'student',
          schoolId:        school.id,
          phone:           form.phone.trim()           || null,
          gender:          form.gender                 || null,
          dateOfBirth:     form.date_of_birth          || null,
          classId:         form.class_id               || null,
          admissionNumber: form.admission_number.trim() || null,
          guardianName:    form.guardian_name.trim()   || null,
          guardianPhone:   form.guardian_phone.trim()  || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to enrol student')

      // Refresh list
      const { data: fresh } = await supabase
        .from('profiles').select('*')
        .eq('school_id', school.id).eq('role', 'student').order('full_name')
      if (fresh) setStudents(fresh)

      // Reset form and show code/password modal
      setForm({ full_name:'', email:'', phone:'', date_of_birth:'', gender:'', class_id:'', admission_number:'', guardian_name:'', guardian_phone:'' })
      setShowForm(false)
      setEnrollResult({ full_name: form.full_name.trim(), email: form.email.trim(), code: json.code, password: json.password })
    } catch (err: any) {
      showToast(err.message ?? 'Failed to enrol student', false)
    }
    setSaving(false)
  }

  const classMap: Record<string, string> = {}
  classes.forEach(c => { classMap[c.id] = c.name })

  const filtered = students.filter(s => {
    const q = search.toLowerCase()
    const matchSearch = !search ||
      s.full_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.default_code?.toLowerCase().includes(q) ||
      s.class_level?.toLowerCase().includes(q)
    const matchClass = !classFilter || s.class_level === classMap[classFilter]
    return matchSearch && matchClass
  })

  // Group by class
  const byClass: Record<string, any[]> = {}
  filtered.forEach(s => {
    const key = s.class_level ?? 'Unassigned'
    if (!byClass[key]) byClass[key] = []
    byClass[key].push(s)
  })

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Students">
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* Code + password modal after enrolment */}
      {enrollResult && (
        <EnrolSuccessModal
          result={enrollResult}
          sc={sc}
          onClose={() => setEnrollResult(null)}
        />
      )}

      {confirmDel && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Remove Student?</h3>
            <p className={styles.dialogBody}>
              This will permanently remove <strong>{confirmDel.full_name}</strong> from the school records. This cannot be undone.
            </p>
            <div className={styles.dialogActions}>
              <button className={styles.cancelBtn} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className={styles.deleteBtn} onClick={() => handleDelete(confirmDel)} disabled={deleting === confirmDel.id}>
                {deleting === confirmDel.id ? 'Removing…' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.container}>
        {/* Summary */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color: sc }}>{students.length}</p>
            <p className={styles.statLbl}>Total Students</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color: '#10B981' }}>{students.filter(s => s.gender?.toLowerCase() === 'male').length}</p>
            <p className={styles.statLbl}>Male</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color: '#EC4899' }}>{students.filter(s => s.gender?.toLowerCase() === 'female').length}</p>
            <p className={styles.statLbl}>Female</p>
          </div>
          <div className={styles.statCard}>
            <p className={styles.statVal} style={{ color: '#8B5CF6' }}>{classes.length}</p>
            <p className={styles.statLbl}>Classes</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className={styles.searchInput} placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)}/>
          </div>
          <select className={styles.filterSelect} value={classFilter} onChange={e => setClassFilter(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button className={styles.addBtn} style={{ background: sc }} onClick={() => setShowForm(v => !v)}>
            {showForm ? '✕ Close' : '+ Enrol Student'}
          </button>
          <Link href="/dashboard/principal/students/transfer" className={styles.addBtn} style={{ background: '#F59E0B', textDecoration: 'none' }}>
            ⇄ Transfer Student
          </Link>
        </div>

        {/* Enrol form */}
        {showForm && (
          <div className={styles.formCard}>
            <p className={styles.formTitle}>Enrol New Student</p>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Full Name *</label>
                <input className={styles.fieldInput} placeholder="e.g. Chioma Okonkwo" value={form.full_name} onChange={e => setForm(f=>({...f,full_name:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Email *</label>
                <input className={styles.fieldInput} type="email" placeholder="e.g. chioma@gmail.com" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Phone</label>
                <input className={styles.fieldInput} placeholder="optional" value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Date of Birth</label>
                <input className={styles.fieldInput} type="date" value={form.date_of_birth} onChange={e => setForm(f=>({...f,date_of_birth:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Gender</label>
                <select className={styles.fieldInput} value={form.gender} onChange={e => setForm(f=>({...f,gender:e.target.value}))}>
                  <option value="">Select gender</option>
                  {GENDER_OPTS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Class</label>
                <select className={styles.fieldInput} value={form.class_id} onChange={e => setForm(f=>({...f,class_id:e.target.value}))}>
                  <option value="">Select class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Admission Number</label>
                <input className={styles.fieldInput} placeholder="e.g. ADM/2025/001" value={form.admission_number} onChange={e => setForm(f=>({...f,admission_number:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Parent / Guardian Name</label>
                <input className={styles.fieldInput} placeholder="e.g. Mr. Okonkwo Emeka" value={form.guardian_name} onChange={e => setForm(f=>({...f,guardian_name:e.target.value}))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Parent / Guardian Phone</label>
                <input className={styles.fieldInput} type="tel" placeholder="e.g. 08012345678" value={form.guardian_phone} onChange={e => setForm(f=>({...f,guardian_phone:e.target.value}))}/>
              </div>
            </div>
            <div className={styles.formActions}>
              <button className={styles.cancelFormBtn} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={styles.saveBtn} style={{ background: sc }} onClick={handleCreate} disabled={saving || !form.full_name.trim() || !form.email.trim()}>
                {saving ? 'Enrolling…' : 'Enrol & Get Code'}
              </button>
            </div>
          </div>
        )}

        {/* Students list grouped by class */}
        {loading ? (
          <div className={styles.loadingList}>
            {[1,2,3,4].map(i => <div key={i} className={styles.skeleton}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <p>{search || classFilter ? 'No students match your filters' : 'No students enrolled yet'}</p>
          </div>
        ) : (
          Object.entries(byClass).sort(([a],[b]) => a.localeCompare(b)).map(([cls, studs]) => (
            <div key={cls} className={styles.classGroup}>
              <div className={styles.classHeader}>
                <span className={styles.className}>{cls}</span>
                <span className={styles.classCount}>{studs.length} student{studs.length !== 1 ? 's' : ''}</span>
              </div>
              <div className={styles.studentList}>
                {studs.map(student => {
                  const initials = student.full_name?.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase() ?? '?'
                  const genderColor = student.gender?.toLowerCase() === 'female' ? '#EC4899' : student.gender?.toLowerCase() === 'male' ? '#3B82F6' : sc
                  return (
                    <div key={student.id} className={styles.studentRow}>
                      <div className={styles.studentAvatar} style={{ background: genderColor + '25', color: genderColor }}>
                        {student.avatar_url
                          ? <img src={student.avatar_url} alt="" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }}/>
                          : initials
                        }
                      </div>
                      <div className={styles.studentInfo}>
                        <p className={styles.studentName}>{student.full_name}</p>
                        <div className={styles.studentMeta}>
                          {student.gender && <span>{student.gender}</span>}
                          {student.date_of_birth && <span>· Age {new Date().getFullYear() - new Date(student.date_of_birth).getFullYear()}</span>}
                          {student.default_code && <span className={styles.codeTag}>{student.default_code}</span>}
                        </div>
                      </div>
                      <button className={styles.delBtn} onClick={() => setConfirmDel(student)} title="Remove student">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
        <div style={{ height: 100 }}/>
      </div>
    </RolePageWrapper>
  )
}