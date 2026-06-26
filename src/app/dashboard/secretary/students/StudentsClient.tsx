'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeTable } from '@/hooks/useRealtimeTable'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

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
    <div className={styles.modalOverlay}>
      <div className={styles.modal} style={{ maxWidth: 440, width: '100%' }}>
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
          <h3 className={styles.modalTitle} style={{ marginBottom: 4 }}>Enrolment Complete!</h3>
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
          className={styles.btnPrimary}
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
  // ── Preview / Edit bottom sheets ───────────────────────────
  const [previewStudent, setPreviewStudent] = useState<any | null>(null)
  const [editStudent,    setEditStudent]    = useState<any | null>(null)
  const [editForm,       setEditForm]       = useState<any>({})
  const [editSaving,     setEditSaving]     = useState(false)
  // ── Assign-class modal state ────────────────────────────────────────────
  const [assignTarget,  setAssignTarget]  = useState<any | null>(null)
  const [assignClassId, setAssignClassId] = useState('')
  const [assigning,     setAssigning]     = useState(false)
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

  // ── Assign / reassign student to a class ───────────────────────────────
  async function handleAssignClass() {
    if (!assignTarget || !assignClassId) return
    setAssigning(true)
    const chosenClass = classes.find(c => c.id === assignClassId)
    const className   = chosenClass?.name ?? null

    // Update profiles.class_level (text) — used for display & grouping
    const { error: profErr } = await supabase
      .from('profiles')
      .update({ class_level: className })
      .eq('id', assignTarget.id)

    // Update student_profiles.class_id (uuid) — used for results/attendance joins
    await supabase
      .from('student_profiles')
      .upsert({ id: assignTarget.id, class_id: assignClassId }, { onConflict: 'id' })

    setAssigning(false)
    if (profErr) { showToast('Failed to assign class', false); return }

    // Optimistically update local list
    setStudents(prev => prev.map(s =>
      s.id === assignTarget.id ? { ...s, class_level: className } : s
    ))
    setAssignTarget(null)
    setAssignClassId('')
    showToast(`${assignTarget.full_name} assigned to ${className}`)
  }

  // ── Save edited student details ────────────────────────────
  async function handleEditSave() {
    if (!editStudent) return
    setEditSaving(true)

    // Only send fields that changed — track by key presence in editForm
    const profileUpdate: any = {}
    const f = editForm
    if ('full_name'        in f) profileUpdate.full_name        = f.full_name        || editStudent.full_name
    if ('phone'            in f) profileUpdate.phone            = f.phone            || null
    if ('date_of_birth'    in f) profileUpdate.date_of_birth    = f.date_of_birth    || null
    if ('gender'           in f) profileUpdate.gender           = f.gender           || null
    if ('admission_number' in f) profileUpdate.admission_number = f.admission_number || null
    if ('address'          in f) profileUpdate.address          = f.address          || null
    if ('class_level'      in f) profileUpdate.class_level      = f.class_level      || null

    const { error } = await supabase.from('profiles').update(profileUpdate).eq('id', editStudent.id)

    // guardian_name + guardian_phone live in student_profiles
    const spUpdate: any = {}
    if ('guardian_name'    in f) spUpdate.guardian_name    = f.guardian_name    || null
    if ('guardian_phone'   in f) spUpdate.guardian_phone   = f.guardian_phone   || null
    if ('admission_number' in f) spUpdate.admission_number = f.admission_number || editStudent.admission_number
    if (Object.keys(spUpdate).length > 0) {
      await supabase.from('student_profiles').update(spUpdate).eq('id', editStudent.id)
    }

    setEditSaving(false)
    if (error) { showToast('Failed to save changes', false); return }

    const merged = { ...editStudent, ...profileUpdate, ...spUpdate }
    setStudents(prev => prev.map(s => s.id === editStudent.id ? merged : s))
    setPreviewStudent(merged)
    setEditStudent(null)
    setEditForm({})
    showToast('Student details updated')
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
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Students">
      {toast && (
        <div style={{ position: "fixed", top: "var(--space-5)", left: "50%", transform: "translateX(-50%)", zIndex: 9999, padding: "10px 20px", borderRadius: 10, fontWeight: 700, fontSize: "0.85rem", color: "#fff", background: toast.ok ? "#10B981" : "#EF4444", boxShadow: "0 4px 20px rgba(0,0,0,0.3)", whiteSpace: "nowrap" }}>
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
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalTitle}>Remove Student?</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "var(--space-5)" }}>
              This will permanently remove <strong>{confirmDel.full_name}</strong> from the school records. This cannot be undone.
            </p>
            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className={styles.btnDanger} onClick={() => handleDelete(confirmDel)} disabled={deleting === confirmDel.id}>
                {deleting === confirmDel.id ? 'Removing…' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Assign / reassign class modal ─────────────────────────────── */}
      {assignTarget && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal} style={{ maxWidth: 400 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%', background: sc + '20',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={sc} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                  <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                </svg>
              </div>
              <div>
                <h3 className={styles.modalTitle} style={{ margin: 0 }}>Assign to Class</h3>
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {assignTarget.full_name}
                  {assignTarget.class_level ? ` · currently in ${assignTarget.class_level}` : ' · currently unassigned'}
                </p>
              </div>
            </div>

            {classes.length === 0 ? (
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: 16 }}>
                No classes found. Create classes first under the Classes section.
              </p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 18 }}>
                {classes.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setAssignClassId(c.id)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 10, cursor: 'pointer',
                      background: assignClassId === c.id ? sc + '18' : 'var(--glass-bg)',
                      border: `1.5px solid ${assignClassId === c.id ? sc + '66' : 'var(--glass-border)'}`,
                      color: assignClassId === c.id ? sc : 'var(--text-base)',
                      fontWeight: assignClassId === c.id ? 700 : 500,
                      fontSize: '0.85rem',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span>{c.name}</span>
                    {assignClassId === c.id && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            )}

            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => { setAssignTarget(null); setAssignClassId('') }}>
                Cancel
              </button>
              <button
                className={styles.btnPrimary}
                style={{ background: sc, opacity: !assignClassId ? 0.5 : 1 }}
                onClick={handleAssignClass}
                disabled={assigning || !assignClassId}
              >
                {assigning ? 'Assigning…' : 'Assign Class'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
        {/* Summary */}
        <div style={{ display: "flex", gap: "var(--space-3)", marginBottom: "var(--space-4)" }}>
          <div style={{ flex: 1, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-3)", textAlign: "center" }}>
            <p style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, lineHeight: 1.2, color: sc }}>{students.length}</p>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", margin: "3px 0 0", fontWeight: 600 }}>Total Students</p>
          </div>
          <div style={{ flex: 1, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-3)", textAlign: "center" }}>
            <p style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, lineHeight: 1.2, color: '#10B981' }}>{students.filter(s => s.gender?.toLowerCase() === 'male').length}</p>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", margin: "3px 0 0", fontWeight: 600 }}>Male</p>
          </div>
          <div style={{ flex: 1, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-3)", textAlign: "center" }}>
            <p style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, lineHeight: 1.2, color: '#EC4899' }}>{students.filter(s => s.gender?.toLowerCase() === 'female').length}</p>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", margin: "3px 0 0", fontWeight: 600 }}>Female</p>
          </div>
          <div style={{ flex: 1, background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: "var(--radius-lg)", padding: "var(--space-3)", textAlign: "center" }}>
            <p style={{ fontSize: "1.4rem", fontWeight: 800, margin: 0, lineHeight: 1.2, color: '#8B5CF6' }}>{classes.length}</p>
            <p style={{ fontSize: "0.68rem", color: "var(--text-muted)", margin: "3px 0 0", fontWeight: 600 }}>Classes</p>
          </div>
        </div>

        {/* Toolbar — row 1: search + class filter */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
          <div style={{ flex: 1, position: 'relative', display: 'flex', alignItems: 'center' }}>
            <svg style={{ position: 'absolute', left: 10, pointerEvents: 'none', flexShrink: 0 }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className={styles.searchInput}
              placeholder="Search students…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: 32, width: '100%' }}
            />
          </div>
          <select
            value={classFilter}
            onChange={e => setClassFilter(e.target.value)}
            style={{
              height: 40, padding: '0 8px', background: 'var(--input-bg)',
              border: '1px solid var(--input-border)', borderRadius: 8,
              color: 'var(--text-primary)', fontSize: '0.8rem', flexShrink: 0, maxWidth: 120,
            }}
          >
            <option value="">All Classes</option>
            {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {/* Toolbar — row 2: action buttons */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)' }}>
          <button
            onClick={() => setShowForm(v => !v)}
            style={{
              flex: 1, height: 40, borderRadius: 8, cursor: 'pointer',
              background: showForm ? 'var(--glass-bg)' : sc,
              color: showForm ? 'var(--text-primary)' : '#fff',
              fontWeight: 700, fontSize: '0.82rem',
              border: showForm ? '1px solid var(--glass-border)' : 'none',
            }}
          >
            {showForm ? '✕ Close Form' : '+ Enrol Student'}
          </button>
          <Link
            href="/dashboard/secretary/students/transfer"
            style={{
              flex: 1, height: 40, borderRadius: 8, border: 'none', cursor: 'pointer',
              background: '#F59E0B', color: '#fff', fontWeight: 700, fontSize: '0.82rem',
              textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ⇄ Transfer
          </Link>
        </div>

        {/* Enrol form */}
        {showForm && (
          <div style={{
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--radius-xl)', padding: 'var(--space-4)',
            marginBottom: 'var(--space-4)',
          }}>
            <p style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 var(--space-4)' }}>
              📝 Enrol New Student
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Full Name *</label>
                <input className={styles.formInput} placeholder="e.g. Chioma Okonkwo" value={form.full_name} onChange={e => setForm(f=>({...f,full_name:e.target.value}))}/>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Email *</label>
                <input className={styles.formInput} type="email" placeholder="e.g. chioma@gmail.com" value={form.email} onChange={e => setForm(f=>({...f,email:e.target.value}))}/>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Phone</label>
                <input className={styles.formInput} placeholder="optional" value={form.phone} onChange={e => setForm(f=>({...f,phone:e.target.value}))}/>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Date of Birth</label>
                <input className={styles.formInput} type="date" value={form.date_of_birth} onChange={e => setForm(f=>({...f,date_of_birth:e.target.value}))}/>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Gender</label>
                <select className={styles.formInput} value={form.gender} onChange={e => setForm(f=>({...f,gender:e.target.value}))}>
                  <option value="">Select gender</option>
                  {GENDER_OPTS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Class</label>
                <select className={styles.formInput} value={form.class_id} onChange={e => setForm(f=>({...f,class_id:e.target.value}))}>
                  <option value="">Select class</option>
                  {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Admission Number</label>
                <input className={styles.formInput} placeholder="e.g. ADM/2025/001" value={form.admission_number} onChange={e => setForm(f=>({...f,admission_number:e.target.value}))}/>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Parent / Guardian Name</label>
                <input className={styles.formInput} placeholder="e.g. Mr. Okonkwo Emeka" value={form.guardian_name} onChange={e => setForm(f=>({...f,guardian_name:e.target.value}))}/>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Parent / Guardian Phone</label>
                <input className={styles.formInput} type="tel" placeholder="e.g. 08012345678" value={form.guardian_phone} onChange={e => setForm(f=>({...f,guardian_phone:e.target.value}))}/>
              </div>
            </div>
            <div className={styles.modalActions} style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 80px)" }}>
              <button className={styles.btnGhost} onClick={() => setShowForm(false)}>Cancel</button>
              <button className={styles.btnPrimary} style={{ background: sc }} onClick={handleCreate} disabled={saving || !form.full_name.trim() || !form.email.trim()}>
                {saving ? 'Enrolling…' : 'Enrol & Get Code'}
              </button>
            </div>
          </div>
        )}

        {/* Students list grouped by class */}
        {loading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
            {[1,2,3,4].map(i => <div key={i} style={{ height: 64, borderRadius: "var(--radius-lg)", background: "var(--glass-bg)", animation: "pulse 1.5s ease-in-out infinite" }}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <p>{search || classFilter ? 'No students match your filters' : 'No students enrolled yet'}</p>
          </div>
        ) : (
          Object.entries(byClass).sort(([a],[b]) => a.localeCompare(b)).map(([cls, studs]) => (
            <div key={cls} style={{ marginBottom: "var(--space-4)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "var(--space-2) 0", marginBottom: "var(--space-2)", borderBottom: "1px solid var(--glass-border)" }}>
                <span style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{cls}</span>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>{studs.length} student{studs.length !== 1 ? 's' : ''}</span>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                {studs.map(student => {
                  const initials = student.full_name?.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase() ?? '?'
                  const genderColor = student.gender?.toLowerCase() === 'female' ? '#EC4899' : student.gender?.toLowerCase() === 'male' ? '#3B82F6' : sc
                  return (
                    <div key={student.id} className={styles.listItem} onClick={() => { setPreviewStudent(student) }} style={{ cursor: 'pointer' }}>
                      <div className={styles.listIconBox} style={{ background: genderColor + '25', color: genderColor }}>
                        {student.avatar_url
                          ? <img src={student.avatar_url} alt="" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }}/>
                          : initials
                        }
                      </div>
                      <div className={styles.listContent}>
                        <p className={styles.listTitle}>{student.full_name}</p>
                        <div className={styles.listSub}>
                          {student.gender && <span>{student.gender}</span>}
                          {student.date_of_birth && <span>· Age {new Date().getFullYear() - new Date(student.date_of_birth).getFullYear()}</span>}
                          {student.default_code && <span style={{ background: "var(--glass-bg)", border: "1px solid var(--glass-border)", borderRadius: 4, padding: "1px 6px", fontSize: "0.7rem", fontFamily: "monospace" }}>{student.default_code}</span>}
                        </div>
                      </div>
                      {/* Assign class button */}
                      <button
                        onClick={() => { setAssignTarget(student); setAssignClassId('') }}
                        title={student.class_level ? `Reassign from ${student.class_level}` : 'Assign to class'}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 28, height: 28, borderRadius: 8, cursor: 'pointer',
                          background: student.class_level ? 'transparent' : sc + '18',
                          border: `1px solid ${student.class_level ? 'var(--glass-border)' : sc + '55'}`,
                          color: student.class_level ? 'var(--text-muted)' : sc,
                          flexShrink: 0, marginRight: 4,
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
                          <line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/>
                        </svg>
                      </button>
                      <button className={styles.btnDanger} onClick={() => setConfirmDel(student)} title="Remove student">
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

      {/* ── Preview bottom sheet ─────────────────────────────── */}
      {previewStudent && !editStudent && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'flex-end' }}
          onClick={() => setPreviewStudent(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:'var(--bg-card)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0', padding:'var(--space-6)', width:'100%', maxHeight:'85vh', overflowY:'auto', animation:'slide-up 0.25s ease' }}
          >
            {/* Handle */}
            <div style={{ width:40, height:4, borderRadius:2, background:'var(--glass-border)', margin:'0 auto var(--space-5)' }}/>

            {/* Avatar + name */}
            <div style={{ display:'flex', alignItems:'center', gap:'var(--space-4)', marginBottom:'var(--space-5)' }}>
              <div style={{
                width:56, height:56, borderRadius:'50%', flexShrink:0, overflow:'hidden',
                background:(previewStudent.gender?.toLowerCase()==='female'?'#EC4899':sc)+'25',
                color:(previewStudent.gender?.toLowerCase()==='female'?'#EC4899':sc),
                display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'1.2rem',
              }}>
                {previewStudent.avatar_url
                  ? <img src={previewStudent.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : previewStudent.full_name?.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()
                }
              </div>
              <div>
                <p style={{ fontWeight:800, fontSize:'1.1rem', color:'var(--text-primary)', margin:0 }}>{previewStudent.full_name}</p>
                <p style={{ fontSize:'0.75rem', color:'var(--text-muted)', margin:'3px 0 0' }}>
                  {previewStudent.class_level ?? 'No class'} · {previewStudent.role}
                </p>
              </div>
            </div>

            {/* Details */}
            {([
              ['Admission No.',   previewStudent.admission_number],
              ['Email',           previewStudent.email],
              ['Phone',           previewStudent.phone],
              ['Gender',          previewStudent.gender],
              ['Date of Birth',   previewStudent.date_of_birth],
              ['Guardian',        previewStudent.guardian_name],
              ['Guardian Phone',  previewStudent.guardian_phone],
              ['Address',         previewStudent.address],
              ['Access Code',     previewStudent.default_code],
            ] as [string,string|null|undefined][]).map(([label, value]) => value ? (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'var(--space-3) 0', borderBottom:'1px solid var(--glass-border)', gap:'var(--space-4)' }}>
                <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', flexShrink:0 }}>{label}</span>
                <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-primary)', textAlign:'right' }}>{value}</span>
              </div>
            ) : (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'var(--space-3) 0', borderBottom:'1px solid var(--glass-border)', gap:'var(--space-4)' }}>
                <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', flexShrink:0 }}>{label}</span>
                <span style={{ fontSize:'0.78rem', color:'var(--text-faint)', fontStyle:'italic' }}>Not set</span>
              </div>
            ))}

            {/* Actions */}
            <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-5)' }}>
              <button
                className={styles.btnPrimary}
                style={{ flex:1, background:sc }}
                onClick={() => { setEditStudent(previewStudent); setEditForm({}) }}
              >
                ✏️ Edit Details
              </button>
              <button className={styles.btnGhost} onClick={() => setPreviewStudent(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit bottom sheet ────────────────────────────────── */}
      {editStudent && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', zIndex:1001, display:'flex', alignItems:'flex-end' }}
          onClick={() => { setEditStudent(null); setEditForm({}) }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:'var(--bg-card)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0', padding:'var(--space-6)', width:'100%', maxHeight:'92vh', overflowY:'auto', animation:'slide-up 0.25s ease' }}
          >
            <div style={{ width:40, height:4, borderRadius:2, background:'var(--glass-border)', margin:'0 auto var(--space-5)' }}/>
            <p style={{ fontWeight:800, fontSize:'1rem', color:'var(--text-primary)', marginBottom:'var(--space-5)' }}>
              Edit — {editStudent.full_name}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--space-3)" }}>
              {([
                ['Full Name',          'full_name',        'text',   'e.g. Chioma Okonkwo'],
                ['Phone',              'phone',            'tel',    'e.g. 08012345678'],
                ['Date of Birth',      'date_of_birth',    'date',   ''],
                ['Admission Number',   'admission_number', 'text',   'e.g. ADM/2025/001'],
                ['Guardian Name',      'guardian_name',    'text',   'e.g. Mr. Okonkwo'],
                ['Guardian Phone',     'guardian_phone',   'tel',    'e.g. 08098765432'],
                ['Address',            'address',          'text',   'e.g. 12 Lagos Street'],
              ] as [string,string,string,string][]).map(([label, key, type, placeholder]) => (
                <div key={key} className={styles.formGroup}>
                  <label className={styles.formLabel}>{label}</label>
                  <input
                    className={styles.formInput}
                    type={type}
                    placeholder={placeholder}
                    value={key in editForm ? editForm[key] : (editStudent?.[key] ?? '')}
                    onChange={e => setEditForm((f:any) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Gender</label>
                <select className={styles.formInput}
                  value={'gender' in editForm ? editForm.gender : (editStudent?.gender ?? '')}
                  onChange={e => setEditForm((f:any) => ({ ...f, gender: e.target.value }))}>
                  <option value="">Select gender</option>
                  {GENDER_OPTS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Class</label>
                <select className={styles.formInput}
                  value={'class_level' in editForm ? editForm.class_level : (editStudent?.class_level ?? '')}
                  onChange={e => setEditForm((f:any) => ({ ...f, class_level: e.target.value }))}>
                  <option value="">Select class</option>
                  {classes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.btnGhost} onClick={() => { setEditStudent(null); setEditForm({}) }}>Cancel</button>
              <button className={styles.btnPrimary} style={{ background:sc }} onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </RolePageWrapper>
  )
}