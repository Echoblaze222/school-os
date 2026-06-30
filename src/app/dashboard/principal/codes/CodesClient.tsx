'use client'
// src/app/dashboard/principal/codes/CodesClient.tsx
// FIXED: Added missing thStyle/tdStyle/cellInputStyle table style constants
//        Fixed bSaved not resetting when bulk rows are edited after a save

import { useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import DOBPicker from '@/components/DOBPicker'
import styles from './codes.module.css'

interface CodeEntry {
  id: string
  full_name: string
  email: string
  role: string
  default_code: string
  is_active: boolean
  created_at: string
}

interface ClassOption {
  id: string
  name: string
  class_level: string
  section: string
}

interface Props {
  entries: CodeEntry[]
  classes: ClassOption[]
  profile: any
  school: any
  userId: string
  schoolId: string
}

const ROLE_META: Record<string, { color: string; icon: string; label: string }> = {
  student:   { color: '#10B981', icon: 'S',  label: 'Student'   },
  teacher:   { color: '#3B82F6', icon: 'T',  label: 'Teacher'   },
  bursar:    { color: '#F59E0B', icon: 'B',  label: 'Bursar'    },
  secretary: { color: '#8B5CF6', icon: 'Sc', label: 'Secretary' },
  librarian: { color: '#EC4899', icon: 'L',  label: 'Librarian' },
  nurse:     { color: '#EF4444', icon: 'N',  label: 'Nurse'     },
  principal: { color: '#800020', icon: 'P',  label: 'Principal' },
  parent:    { color: '#06B6D4', icon: 'Pa', label: 'Parent'    },
}
const ROLES_ASSIGNABLE = ['student','teacher','bursar','secretary','librarian','nurse','parent']
const GENDERS = ['Male', 'Female', 'Other']
const STATES_NG = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
  'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
  'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
  'Yobe','Zamfara',
]

// ── FIX 1: Table style objects that were missing in the new bulk grid UI ──────
const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  textAlign: 'left',
  fontSize: '0.7rem',
  fontWeight: 700,
  color: 'var(--text-muted)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  borderBottom: '1px solid var(--glass-border)',
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '4px 6px',
  verticalAlign: 'middle',
}

const cellInputStyle: React.CSSProperties = {
  width: '100%',
  background: 'transparent',
  border: 'none',
  outline: 'none',
  color: 'var(--text-primary)',
  fontSize: '0.82rem',
  padding: '6px 4px',
  borderRadius: 'var(--radius-sm)',
  fontFamily: 'inherit',
}
// ─────────────────────────────────────────────────────────────────────────────

function roleMeta(role: string) {
  return ROLE_META[role] ?? { color: '#6B7280', icon: '?', label: role }
}

interface BulkRow {
  full_name: string
  email: string
  role: string
  phone: string
  gender: string
  dateOfBirth: string
  classId: string
  admissionNumber: string
  guardianName: string
  guardianPhone: string
}
const EMPTY_ROW = (): BulkRow => ({
  full_name: '', email: '', role: 'student',
  phone: '', gender: '', dateOfBirth: '',
  classId: '', admissionNumber: '', guardianName: '', guardianPhone: '',
})
const DEFAULT_ROWS = 5

function makePassword() {
  const chars   = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  const special = '@#$!'
  let pass = special[Math.floor(Math.random() * special.length)]
  for (let i = 0; i < 8; i++) pass += chars[Math.floor(Math.random() * chars.length)]
  return pass
}

interface GeneratedEntry extends BulkRow { code: string; password: string; saved: boolean; error: string | null }

// ─── Success screen shown after single enrolment ─────────────────────────────
function CodeSuccessScreen({
  result, sc, onEnrolAnother,
}: {
  result: { full_name: string; email: string; role: string; code: string; password: string }
  sc: string
  onEnrolAnother: () => void
}) {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedPwd,  setCopiedPwd]  = useState(false)
  const m = roleMeta(result.role)

  async function copy(text: string, which: 'code' | 'pwd') {
    await navigator.clipboard.writeText(text).catch(() => {})
    if (which === 'code') { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000) }
    else                  { setCopiedPwd(true);  setTimeout(() => setCopiedPwd(false),  2000) }
  }

  async function copyBoth() {
    const text = `Name: ${result.full_name}\nRole: ${roleMeta(result.role).label}\nAccess Code: ${result.code}\nPassword: ${result.password}`
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopiedCode(true); setCopiedPwd(true)
    setTimeout(() => { setCopiedCode(false); setCopiedPwd(false) }, 2500)
  }

  return (
    <div className={styles.successScreen}>
      <div className={styles.successIcon}>
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
      </div>

      <h2 className={styles.successTitle}>Enrolment Complete!</h2>
      <p className={styles.successSub}>
        Share the code and password below with <strong>{result.full_name}</strong>. They will use these to log in for the first time.
      </p>

      <div className={styles.successBadge}>
        <div className={styles.successAvatar} style={{ background: m.color + '22', color: m.color }}>
          {result.full_name.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase()}
        </div>
        <div>
          <p className={styles.successName}>{result.full_name}</p>
          <p className={styles.successEmail}>{result.email}</p>
          <span className={styles.successRoleBadge} style={{ background: m.color + '18', color: m.color, borderColor: m.color + '44' }}>
            {m.label}
          </span>
        </div>
      </div>

      <div className={styles.credentialBox} style={{ borderColor: sc + '44', background: sc + '0a' }}>
        <p className={styles.credLabel}>Access Code</p>
        <div className={styles.credRow}>
          <code className={styles.credValue} style={{ color: sc }}>{result.code}</code>
          <button
            onClick={() => copy(result.code, 'code')}
            className={styles.credCopy}
            style={copiedCode ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : { borderColor: sc + '55', color: sc }}
          >
            {copiedCode ? '✓ Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <div className={styles.credentialBox} style={{ borderColor: '#F59E0B44', background: '#F59E0B0a' }}>
        <p className={styles.credLabel}>Temporary Password</p>
        <div className={styles.credRow}>
          <code className={styles.credValue} style={{ color: '#F59E0B' }}>{result.password}</code>
          <button
            onClick={() => copy(result.password, 'pwd')}
            className={styles.credCopy}
            style={copiedPwd ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : { borderColor: '#F59E0B55', color: '#F59E0B' }}
          >
            {copiedPwd ? '✓ Copied' : 'Copy'}
          </button>
        </div>
        <p className={styles.credWarning}>⚠️ User must change this password on first login.</p>
      </div>

      <button onClick={copyBoth} className={styles.copyBothBtn}>
        Copy All Details
      </button>

      <button onClick={onEnrolAnother} className={styles.enrolAnotherBtn}>
        + Enrol Another Person
      </button>
    </div>
  )
}

export default function CodesClient({ entries: init, classes, profile, school, userId, schoolId }: Props) {
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#800020'

  const [entries,  setEntries]  = useState(init)
  const [search,   setSearch]   = useState('')
  const [roleTab,  setRoleTab]  = useState('all')
  const [copied,   setCopied]   = useState<string | null>(null)
  const [regen,    setRegen]    = useState<string | null>(null)
  const [tab,      setTab]      = useState<'existing' | 'enrol' | 'bulk'>('existing')

  // ── Enrol single ──────────────────────────────────────────
  const [sRole,    setSRole]    = useState('student')
  const [sLoading, setSLoading] = useState(false)
  const [sError,   setSError]   = useState<string | null>(null)
  const [sResult,  setSResult]  = useState<{ full_name: string; email: string; role: string; code: string; password: string } | null>(null)

  // Common fields
  const [fName,    setFName]    = useState('')
  const [fEmail,   setFEmail]   = useState('')
  const [fPhone,   setFPhone]   = useState('')
  const [fGender,  setFGender]  = useState('')
  const [fDOB,     setFDOB]     = useState('')
  const [fAddress, setFAddress] = useState('')
  const [fState,   setFState]   = useState('')

  // Student-only fields
  const [fClass,    setFClass]    = useState('')
  const [fAdmNo,    setFAdmNo]    = useState('')
  const [fGuardian, setFGuardian] = useState('')
  const [fGuardPh,  setFGuardPh]  = useState('')

  // Staff-only fields
  const [fQual,    setFQual]    = useState('')
  const [fSubject, setFSubject] = useState('')

  // ── Bulk ──────────────────────────────────────────────────
  const [bRows,      setBRows]      = useState<BulkRow[]>(() => Array.from({ length: DEFAULT_ROWS }, EMPTY_ROW))
  const [bResults,   setBResults]   = useState<GeneratedEntry[]>([])
  const [bLoading,   setBLoading]   = useState(false)
  const [bSaved,     setBSaved]     = useState(false)
  const [copiedAll,  setCopiedAll]  = useState(false)
  const [copiedPwds, setCopiedPwds] = useState<Record<number, boolean>>({})

  const roles = useMemo(() => ['all', ...Array.from(new Set(entries.map(e => e.role))).sort()], [entries])

  const filtered = useMemo(() => entries.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = (e.full_name ?? '').toLowerCase().includes(q)
      || (e.default_code ?? '').toLowerCase().includes(q)
      || (e.email ?? '').toLowerCase().includes(q)
    const matchRole = roleTab === 'all' || e.role === roleTab
    return matchSearch && matchRole
  }), [entries, search, roleTab])

  function resetForm() {
    setFName(''); setFEmail(''); setFPhone(''); setFGender(''); setFDOB('')
    setFAddress(''); setFState(''); setFClass(''); setFAdmNo('')
    setFGuardian(''); setFGuardPh(''); setFQual(''); setFSubject('')
    setSError(null)
  }

  async function regenerateCode(entry: CodeEntry) {
    setRegen(entry.id)
    const prefix  = entry.role.slice(0, 3).toUpperCase()
    const year    = new Date().getFullYear()
    const rand    = Math.floor(1000 + Math.random() * 9000)
    const newCode = `${prefix}-${year}-${rand}`
    const { error } = await supabase.from('profiles').update({ default_code: newCode }).eq('id', entry.id)
    if (!error) setEntries(p => p.map(e => e.id === entry.id ? { ...e, default_code: newCode } : e))
    setRegen(null)
  }

  async function copyCode(code: string, id: string) {
    await navigator.clipboard.writeText(code).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleEnrol() {
    if (!fName.trim() || !fEmail.trim()) { setSError('Full name and email are required.'); return }
    setSError(null); setSLoading(true)
    try {
      const res  = await fetch('/api/secretary/create-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fullName:         fName.trim(),
          email:            fEmail.trim().toLowerCase(),
          role:             sRole,
          schoolId,
          phone:            fPhone.trim() || null,
          gender:           fGender || null,
          dateOfBirth:      fDOB || null,
          address:          fAddress.trim() || null,
          state:            fState || null,
          classId:          sRole === 'student' ? (fClass || null) : null,
          admissionNumber:  sRole === 'student' ? (fAdmNo.trim() || null) : null,
          guardianName:     sRole === 'student' ? (fGuardian.trim() || null) : null,
          guardianPhone:    sRole === 'student' ? (fGuardPh.trim() || null) : null,
          qualification:    sRole !== 'student' ? (fQual.trim() || null) : null,
          subjectSpecialty: sRole !== 'student' ? (fSubject.trim() || null) : null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create user')

      setSResult({ full_name: fName.trim(), email: fEmail.trim(), role: sRole, code: json.code, password: json.password })

      const { data: fresh } = await supabase
        .from('profiles').select('id,full_name,email,role,default_code,is_active,created_at')
        .eq('school_id', schoolId).order('role').order('full_name')
      if (fresh) setEntries(fresh)

      resetForm()
    } catch (err: any) {
      setSError(err.message ?? 'Failed to save')
    }
    setSLoading(false)
  }

  // ── FIX: Bulk Add now saves directly — no more "Preview Codes" stage that
  // showed fake, unsaved codes which looked real but didn't work at login.
  // One click = real users created in the database immediately.
  async function handleBulkSave() {
    const validRows = bRows.filter(r => r.full_name.trim() && r.email.trim() && ROLES_ASSIGNABLE.includes(r.role))
    if (!validRows.length) return

    setBLoading(true)
    // Seed bResults immediately so the UI shows "Saving..." rows, not nothing
    setBResults(validRows.map(r => ({ ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: '', password: '', saved: false, error: null })))

    const updated = await Promise.all(
      validRows.map(async (r) => {
        try {
          const res  = await fetch('/api/secretary/create-user', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              fullName:         r.full_name.trim(),
              email:            r.email.trim().toLowerCase(),
              role:             r.role,
              schoolId,
              phone:            r.phone.trim() || null,
              gender:           r.gender || null,
              dateOfBirth:      r.dateOfBirth || null,
              classId:          r.role === 'student' ? (r.classId || null) : null,
              admissionNumber:  r.role === 'student' ? (r.admissionNumber.trim() || null) : null,
              guardianName:     r.role === 'student' ? (r.guardianName.trim() || null) : null,
              guardianPhone:    r.role === 'student' ? (r.guardianPhone.trim() || null) : null,
            }),
          })
          const json = await res.json()
          if (!res.ok) return { ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: '', password: '', error: json.error ?? 'Failed', saved: false }
          return { ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: json.code, password: json.password, saved: true, error: null }
        } catch (e: any) {
          return { ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: '', password: '', error: e.message ?? 'Network error', saved: false }
        }
      })
    )
    setBResults(updated)
    if (updated.some(r => r.saved)) {
      const { data: fresh } = await supabase
        .from('profiles').select('id,full_name,email,role,default_code,is_active,created_at')
        .eq('school_id', schoolId).order('role').order('full_name')
      if (fresh) setEntries(fresh)
    }
    if (updated.every(r => r.saved)) setBSaved(true)
    setBLoading(false)
  }

  async function copyAllCodes(list: GeneratedEntry[]) {
    const text = list.filter(r => r.saved).map(r => `${r.full_name} | ${roleMeta(r.role).label} | Code: ${r.code} | Password: ${r.password}`).join('\n')
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopiedAll(true)
    setTimeout(() => setCopiedAll(false), 2500)
  }

  // Helper to update a bulk row and reset the results + saved flag
  function updateBulkRow(index: number, patch: Partial<BulkRow>) {
    setBRows(prev => {
      const next = [...prev]
      next[index] = { ...next[index], ...patch }
      return next
    })
    setBResults([])
    setBSaved(false)
  }

  const RoleChip = ({ r }: { r: string }) => {
    const m        = roleMeta(r)
    const isActive = roleTab === r
    const count    = r === 'all' ? entries.length : entries.filter(e => e.role === r).length
    return (
      <button onClick={() => setRoleTab(r)} className={styles.roleChip}
        style={{
          background:  isActive ? m.color + '22' : 'var(--glass-bg)',
          borderColor: isActive ? m.color : 'var(--glass-border)',
          color:       isActive ? m.color : 'var(--text-muted)',
        }}>
        {r === 'all' ? 'All' : m.label} ({count})
      </button>
    )
  }

  const isStudent = sRole === 'student'

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Enrolment & Codes">

      <div className={styles.tabRow}>
        {(['existing','enrol','bulk'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSResult(null) }}
            className={`${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`}>
            {t === 'existing' && 'All Codes'}
            {t === 'enrol'    && 'Enrol / Add User'}
            {t === 'bulk'     && 'Bulk Add'}
          </button>
        ))}
      </div>

      {/* ── EXISTING CODES ── */}
      {tab === 'existing' && (
        <>
          <div className={styles.infoBanner}>
            <div>
              <p className={styles.infoBannerTitle}>Access Codes</p>
              <p className={styles.infoBannerSub}>Every user has a unique login code. Share it with them to access SchoolOS. Regenerate a code if it has been compromised.</p>
            </div>
          </div>

          <div className={styles.searchWrap}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className={styles.searchInput} placeholder="Search by name, email or code..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          <div className={styles.roleTabs}>
            {roles.map(r => <RoleChip key={r} r={r} />)}
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}><p className={styles.emptyIcon}>No users found</p></div>
          ) : (
            <div className={styles.codeList}>
              {filtered.map(e => {
                const m = roleMeta(e.role)
                return (
                  <div key={e.id} className={styles.codeRow}>
                    <div className={styles.avatar} style={{ background: m.color + '22' }}>
                      <span style={{ fontSize: '1rem', fontWeight: 700, color: m.color }}>{m.icon}</span>
                    </div>
                    <div className={styles.codeRowInfo}>
                      <p className={styles.codeRowName}>{e.full_name}</p>
                      <p className={styles.codeRowEmail}>{e.email}</p>
                    </div>
                    <span className={styles.roleBadge} style={{ background: m.color + '18', color: m.color, borderColor: m.color + '44' }}>
                      {m.label}
                    </span>
                    <code className={styles.codeChip} style={{ background: sc + '15', color: sc }}>
                      {e.default_code}
                    </code>
                    <div className={styles.codeRowActions}>
                      <button onClick={() => copyCode(e.default_code, e.id)} className={styles.actionBtn}
                        style={copied === e.id ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : {}}>
                        {copied === e.id ? 'Copied' : 'Copy'}
                      </button>
                      <button onClick={() => regenerateCode(e)} disabled={regen === e.id} className={styles.actionBtn}
                        style={{ opacity: regen === e.id ? 0.5 : 1 }}>
                        {regen === e.id ? 'Wait...' : 'Regen'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ── ENROL / ADD USER ── */}
      {tab === 'enrol' && (
        <>
          {sResult ? (
            <CodeSuccessScreen
              result={sResult}
              sc={sc}
              onEnrolAnother={() => { setSResult(null); setSRole('student') }}
            />
          ) : (
            <div className={styles.enrolForm}>
              <div className={styles.formHeader}>
                <p className={styles.formTitle}>Enrol / Add User</p>
                <p className={styles.formSub}>Fill in the details below. After saving, you will get the access code and password to share with them.</p>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Role *</label>
                <div className={styles.roleGrid}>
                  {ROLES_ASSIGNABLE.map(r => {
                    const m = roleMeta(r)
                    return (
                      <button key={r} onClick={() => setSRole(r)}
                        className={styles.roleOption}
                        style={{
                          background:  sRole === r ? m.color + '22' : 'var(--glass-bg)',
                          borderColor: sRole === r ? m.color : 'var(--glass-border)',
                          color:       sRole === r ? m.color : 'var(--text-muted)',
                        }}>
                        {m.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className={styles.formDivider}>
                <span>Personal Information</span>
              </div>

              <div className={styles.fieldGrid}>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Full Name *</label>
                  <input className={styles.fieldInput} placeholder="e.g. Amara Osei" value={fName} onChange={e => setFName(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Email Address *</label>
                  <input className={styles.fieldInput} type="email" placeholder="e.g. amara@gmail.com" value={fEmail} onChange={e => setFEmail(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Phone Number</label>
                  <input className={styles.fieldInput} type="tel" placeholder="e.g. 08012345678" value={fPhone} onChange={e => setFPhone(e.target.value)} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Gender</label>
                  <select className={`${styles.fieldInput} ${styles.fieldSelect}`} value={fGender} onChange={e => setFGender(e.target.value)}>
                    <option value="">Select gender...</option>
                    {GENDERS.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                  </select>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Date of Birth</label>
                  <DOBPicker value={fDOB} onChange={setFDOB} inputStyle={{
                    background: 'var(--input-bg)', border: '1px solid var(--input-border)',
                    borderRadius: 'var(--radius-md)', color: 'var(--text-primary)',
                    fontSize: '0.82rem', padding: '10px 8px', fontFamily: 'inherit',
                  }} />
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>State of Origin</label>
                  <select className={`${styles.fieldInput} ${styles.fieldSelect}`} value={fState} onChange={e => setFState(e.target.value)}>
                    <option value="">Select state...</option>
                    {STATES_NG.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className={`${styles.fieldGroup} ${styles.fieldFull}`}>
                  <label className={styles.fieldLabel}>Home Address</label>
                  <input className={styles.fieldInput} placeholder="e.g. 12 Unity Street, Lagos" value={fAddress} onChange={e => setFAddress(e.target.value)} />
                </div>
              </div>

              {isStudent && (
                <>
                  <div className={styles.formDivider}><span>Student Details</span></div>
                  <div className={styles.fieldGrid}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Class</label>
                      <select className={`${styles.fieldInput} ${styles.fieldSelect}`} value={fClass} onChange={e => setFClass(e.target.value)}>
                        <option value="">Select class...</option>
                        {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Admission Number</label>
                      <input className={styles.fieldInput} placeholder="e.g. ADM/2025/001" value={fAdmNo} onChange={e => setFAdmNo(e.target.value)} />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Parent / Guardian Name</label>
                      <input className={styles.fieldInput} placeholder="e.g. Mr. Osei Kofi" value={fGuardian} onChange={e => setFGuardian(e.target.value)} />
                    </div>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Parent / Guardian Phone</label>
                      <input className={styles.fieldInput} type="tel" placeholder="e.g. 08098765432" value={fGuardPh} onChange={e => setFGuardPh(e.target.value)} />
                    </div>
                  </div>
                </>
              )}

              {!isStudent && (
                <>
                  <div className={styles.formDivider}><span>Staff Details</span></div>
                  <div className={styles.fieldGrid}>
                    <div className={styles.fieldGroup}>
                      <label className={styles.fieldLabel}>Qualification</label>
                      <input className={styles.fieldInput} placeholder="e.g. B.Ed Mathematics" value={fQual} onChange={e => setFQual(e.target.value)} />
                    </div>
                    {sRole === 'teacher' && (
                      <div className={styles.fieldGroup}>
                        <label className={styles.fieldLabel}>Subject Specialty</label>
                        <input className={styles.fieldInput} placeholder="e.g. Mathematics, Physics" value={fSubject} onChange={e => setFSubject(e.target.value)} />
                      </div>
                    )}
                  </div>
                </>
              )}

              {sError && <p className={styles.errorMsg}>{sError}</p>}

              <button onClick={handleEnrol} disabled={sLoading} className={styles.generateBtn}>
                {sLoading ? 'Saving...' : `Enrol ${roleMeta(sRole).label} & Get Code`}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── BULK ADD ── */}
      {tab === 'bulk' && (
        <>
          <div className={styles.formCard} style={{ marginBottom: 'var(--space-5)' }}>
            <div className={styles.formHeader}>
              <p className={styles.formTitle}>Bulk Add Users</p>
              <p className={styles.formSub}>Fill in each row directly. Leave blank rows empty — they'll be ignored.</p>
            </div>
            <div className={styles.formBody}>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1100 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-elevated)' }}>
                      <th style={thStyle}>#</th>
                      <th style={thStyle}>Full Name *</th>
                      <th style={thStyle}>Email *</th>
                      <th style={thStyle}>Role *</th>
                      <th style={thStyle}>Phone</th>
                      <th style={thStyle}>Gender</th>
                      <th style={{ ...thStyle, minWidth: 230 }}>Date of Birth</th>
                      <th style={thStyle}>Class</th>
                      <th style={thStyle}>Admission No.</th>
                      <th style={thStyle}>Guardian Name</th>
                      <th style={thStyle}>Guardian Phone</th>
                      <th style={thStyle} />
                    </tr>
                  </thead>
                  <tbody>
                    {bRows.map((row, i) => {
                      const isEmpty    = !row.full_name && !row.email
                      const m          = roleMeta(row.role)
                      const isStudentR = row.role === 'student'
                      return (
                        <tr
                          key={i}
                          style={{
                            borderBottom: '1px solid var(--glass-border)',
                            background: isEmpty ? 'transparent' : m.color + '06',
                          }}
                        >
                          <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 700 }}>
                            {i + 1}
                          </td>

                          <td style={tdStyle}>
                            <input
                              value={row.full_name}
                              placeholder="e.g. Amara Osei"
                              onChange={e => updateBulkRow(i, { full_name: e.target.value })}
                              onKeyDown={e => {
                                if (e.key === 'Tab' && !e.shiftKey && i === bRows.length - 1) {
                                  e.preventDefault()
                                  setBRows(r => [...r, EMPTY_ROW()])
                                }
                              }}
                              style={cellInputStyle}
                            />
                          </td>

                          <td style={tdStyle}>
                            <input
                              type="email"
                              value={row.email}
                              placeholder="e.g. amara@gmail.com"
                              onChange={e => updateBulkRow(i, { email: e.target.value })}
                              style={cellInputStyle}
                            />
                          </td>

                          <td style={tdStyle}>
                            <select
                              value={row.role}
                              onChange={e => updateBulkRow(i, { role: e.target.value })}
                              style={{
                                ...cellInputStyle,
                                color: m.color,
                                fontWeight: 700,
                                paddingRight: 4,
                              }}
                            >
                              {ROLES_ASSIGNABLE.map(r => (
                                <option key={r} value={r}>{roleMeta(r).label}</option>
                              ))}
                            </select>
                          </td>

                          <td style={tdStyle}>
                            <input
                              type="tel"
                              value={row.phone}
                              placeholder="08012345678"
                              onChange={e => updateBulkRow(i, { phone: e.target.value })}
                              style={cellInputStyle}
                            />
                          </td>

                          <td style={tdStyle}>
                            <select
                              value={row.gender}
                              onChange={e => updateBulkRow(i, { gender: e.target.value })}
                              style={cellInputStyle}
                            >
                              <option value="">—</option>
                              {GENDERS.map(g => <option key={g} value={g.toLowerCase()}>{g}</option>)}
                            </select>
                          </td>

                          <td style={tdStyle}>
                            <DOBPicker
                              value={row.dateOfBirth}
                              onChange={v => updateBulkRow(i, { dateOfBirth: v })}
                              inputStyle={cellInputStyle}
                            />
                          </td>

                          <td style={tdStyle}>
                            <select
                              value={row.classId}
                              onChange={e => updateBulkRow(i, { classId: e.target.value })}
                              disabled={!isStudentR}
                              style={{ ...cellInputStyle, opacity: isStudentR ? 1 : 0.35 }}
                            >
                              <option value="">—</option>
                              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                            </select>
                          </td>

                          <td style={tdStyle}>
                            <input
                              value={row.admissionNumber}
                              placeholder={isStudentR ? 'ADM/2025/001' : ''}
                              disabled={!isStudentR}
                              onChange={e => updateBulkRow(i, { admissionNumber: e.target.value })}
                              style={{ ...cellInputStyle, opacity: isStudentR ? 1 : 0.35 }}
                            />
                          </td>

                          <td style={tdStyle}>
                            <input
                              value={row.guardianName}
                              placeholder={isStudentR ? 'Mr. Osei Kofi' : ''}
                              disabled={!isStudentR}
                              onChange={e => updateBulkRow(i, { guardianName: e.target.value })}
                              style={{ ...cellInputStyle, opacity: isStudentR ? 1 : 0.35 }}
                            />
                          </td>

                          <td style={tdStyle}>
                            <input
                              type="tel"
                              value={row.guardianPhone}
                              placeholder={isStudentR ? '08098765432' : ''}
                              disabled={!isStudentR}
                              onChange={e => updateBulkRow(i, { guardianPhone: e.target.value })}
                              style={{ ...cellInputStyle, opacity: isStudentR ? 1 : 0.35 }}
                            />
                          </td>

                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <button
                              onClick={() => {
                                const next = bRows.length === 1 ? [EMPTY_ROW()] : bRows.filter((_, idx) => idx !== i)
                                setBRows(next)
                                setBResults([])
                                setBSaved(false)
                              }}
                              title="Remove row"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: 'var(--text-muted)', padding: 4, lineHeight: 1,
                                opacity: isEmpty ? 0.3 : 0.7,
                              }}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <button
                onClick={() => setBRows(r => [...r, EMPTY_ROW()])}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'none', border: '1px dashed var(--glass-border)',
                  borderRadius: 'var(--radius-md)', padding: '8px 16px',
                  color: 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700,
                  cursor: 'pointer', width: '100%', justifyContent: 'center',
                  transition: 'all var(--transition-fast)',
                }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--glass-border-hover)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--glass-border)')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Row
              </button>

              {(() => {
                const filled = bRows.filter(r => r.full_name.trim() && r.email.trim()).length
                return filled > 0 ? (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                    {filled} user{filled !== 1 ? 's' : ''} ready to save
                  </p>
                ) : null
              })()}

              <button
                onClick={handleBulkSave}
                className={styles.previewBtn}
                disabled={bLoading || !bRows.some(r => r.full_name.trim() && r.email.trim())}
              >
                {bLoading ? 'Saving...' : 'Save All Users'}
              </button>
            </div>
          </div>

          {bResults.length > 0 && (
            <div className={styles.bulkPreviewCard}>
              <div className={styles.bulkPreviewHeader}>
                <div>
                  <p className={styles.formTitle}>{bResults.length} User{bResults.length !== 1 ? 's' : ''} {bLoading ? 'Saving…' : 'Processed'}</p>
                  <p className={styles.formSub}>{bLoading ? 'Creating accounts, please wait...' : 'Codes below are live — share them now.'}</p>
                </div>
                <div className={styles.bulkActions}>
                  <button onClick={() => copyAllCodes(bResults)} className={styles.copyAllBtn}
                    disabled={bLoading}
                    style={copiedAll ? { borderColor: '#10B981', color: '#10B981' } : {}}>
                    {copiedAll ? 'All Copied' : 'Copy All'}
                  </button>
                  {bSaved && <span className={styles.savedBadge}>All Saved ✓</span>}
                </div>
              </div>
              <div className={styles.bulkTableHead}>
                <span>USER</span><span>ROLE</span><span>CODE</span><span>PASSWORD</span><span>STATUS</span>
              </div>
              <div className={styles.bulkTableBody}>
                {bResults.map((r, i) => {
                  const m = roleMeta(r.role)
                  return (
                    <div key={i} className={styles.bulkRow}>
                      <div className={styles.bulkUser}>
                        <div className={styles.avatarSm} style={{ background: m.color + '22', color: m.color, fontWeight: 700, fontSize: '0.75rem' }}>{m.icon}</div>
                        <div>
                          <p className={styles.bulkName}>{r.full_name}</p>
                          <p className={styles.bulkEmail}>{r.email}</p>
                        </div>
                      </div>
                      <span className={styles.roleBadge} style={{ background: m.color + '18', color: m.color, borderColor: m.color + '44' }}>{m.label}</span>
                      <code className={styles.codeChip} style={{ background: sc + '15', color: sc }}>{r.code || (bLoading ? '…' : '—')}</code>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <code className={styles.codeChip} style={{ background: '#F59E0B15', color: '#F59E0B' }}>{r.password || (bLoading ? '…' : '—')}</code>
                        {r.password && (
                          <button
                            onClick={async () => {
                              await navigator.clipboard.writeText(r.password).catch(() => {})
                              setCopiedPwds(p => ({ ...p, [i]: true }))
                              setTimeout(() => setCopiedPwds(p => ({ ...p, [i]: false })), 2000)
                            }}
                            className={styles.actionBtn}
                            style={copiedPwds[i] ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : { borderColor: '#F59E0B55', color: '#F59E0B' }}>
                            {copiedPwds[i] ? '✓' : 'Copy'}
                          </button>
                        )}
                      </div>
                      <span style={{ color: r.error ? '#EF4444' : r.saved ? '#10B981' : 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>
                        {r.error ? (r.error.length > 24 ? 'Error' : r.error) : r.saved ? 'Saved ✓' : bLoading ? 'Saving…' : 'Pending'}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}