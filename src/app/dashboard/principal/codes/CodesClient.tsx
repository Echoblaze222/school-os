'use client'
// src/app/dashboard/principal/codes/CodesClient.tsx
// FIXED: Added missing thStyle/tdStyle/cellInputStyle table style constants
//        Fixed bSaved not resetting when bulk rows are edited after a save

import { useState, useMemo, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import DOBPicker from '@/components/DOBPicker'
import styles from './codes.module.css'
import { CheckIcon, BulbIcon, SearchIcon, UserIcon } from '@/components/Icons'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from '@/lib/supabase/appointments-types'
import { HostelPicker } from '@/components/org/HostelPicker'

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
const ROLES_ASSIGNABLE = ['student','teacher','bursar','secretary','parent']
const GENDERS = ['Male', 'Female', 'Other']
const STATES_NG = [
  'Abia','Adamawa','Akwa Ibom','Anambra','Bauchi','Bayelsa','Benue','Borno',
  'Cross River','Delta','Ebonyi','Edo','Ekiti','Enugu','FCT','Gombe','Imo',
  'Jigawa','Kaduna','Kano','Katsina','Kebbi','Kogi','Kwara','Lagos','Nasarawa',
  'Niger','Ogun','Ondo','Osun','Oyo','Plateau','Rivers','Sokoto','Taraba',
  'Yobe','Zamfara',
]

// Appointment roles selectable as an "Additional Role" when enrolling a
// new Teacher, and in the separate "Assign Role" tab for existing staff.
// Excludes vice_principal/hod (need their own scope UI, added separately
// below) and the 4 student_leadership types (those go to an existing
// student picked from the roster in Leadership & Appointments, never
// created as a new account here - see enrol-with-role/route.ts's own
// guard for why).
const APPOINTMENT_ROLE_TYPES = (Object.keys(APPOINTMENT_TYPES) as AppointmentTypeId[])
  .filter(id => APPOINTMENT_TYPES[id].baseRoleScope.includes('teacher') && !['vice_principal', 'hod'].includes(id))
const CATEGORY_ORDER = ['welfare', 'ict', 'operations', 'hostel', 'academic']
const CATEGORY_LABELS: Record<string, string> = {
  welfare: 'Welfare', ict: 'ICT', operations: 'Operations',
  hostel: 'Hostel Staff', academic: 'Leadership & Examinations',
}
const HOSTEL_SCOPED_TYPES = new Set<AppointmentTypeId>(['warden', 'assistant_warden', 'house_parent', 'hostel_administrator'])

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

interface GeneratedEntry extends BulkRow { code: string; saved: boolean; error: string | null }

// ─── Success screen shown after single enrolment ─────────────────────────────
function CodeSuccessScreen({
  result, sc, onEnrolAnother,
}: {
  result: { full_name: string; email: string; role: string; code: string; warning?: string | null }
  sc: string
  onEnrolAnother: () => void
}) {
  const [copiedCode, setCopiedCode] = useState(false)
  const m = roleMeta(result.role)

  async function copyCode() {
    const text = `Name: ${result.full_name}\nRole: ${roleMeta(result.role).label}\nAccess Code: ${result.code}`
    await navigator.clipboard.writeText(text).catch(() => {})
    setCopiedCode(true)
    setTimeout(() => setCopiedCode(false), 2500)
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
        Share the access code below with <strong>{result.full_name}</strong>. They will use it on the <strong>New User</strong> page to set their own password and complete setup.
      </p>

      {result.warning && (
        <div className={styles.errorMsg} style={{ marginBottom: 'var(--space-3)' }}>
          {result.warning}
        </div>
      )}

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
            onClick={() => { navigator.clipboard.writeText(result.code).catch(() => {}); setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000) }}
            className={`pressable ${styles.credCopy}`}
            style={copiedCode ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : { borderColor: sc + '55', color: sc }}
          >
            {copiedCode ? <><CheckIcon size={13} /> Copied</> : 'Copy'}
          </button>
        </div>
        <p className={styles.credWarning} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
          <BulbIcon size={14} /> The user enters this code on the <strong>New User</strong> tab at login to set their own password.
        </p>
      </div>

      <button onClick={copyCode} className={`${styles.copyBothBtn} pressable`}>
        Copy Details
      </button>

      <button onClick={onEnrolAnother} className={`${styles.enrolAnotherBtn} pressable`}>
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
  const [tab,      setTab]      = useState<'existing' | 'enrol' | 'bulk' | 'assign-role'>('existing')

  // ── Additional appointment role (new-hire enrol flow) ─────
  const [sAppointmentType, setSAppointmentType] = useState<AppointmentTypeId | ''>('')
  const [sDepartmentId,    setSDepartmentId]    = useState('')   // HOD
  const [sDepartmentIds,   setSDepartmentIds]   = useState<string[]>([])  // VP
  const [sPortfolio,       setSPortfolio]       = useState('')            // VP
  const [sHostelIds,       setSHostelIds]       = useState<string[]>([])  // warden-tier
  const [departments,      setDepartments]      = useState<{ id: string; name: string }[]>([])
  const [hostels,          setHostels]          = useState<{ id: string; name: string }[]>([])
  const [scopeDataLoaded,  setScopeDataLoaded]  = useState(false)

  // Departments/hostels are only needed once a scoped role is actually
  // picked - fetched lazily on first need rather than on every page load,
  // since most enrolments never touch this path.
  async function ensureScopeData() {
    if (scopeDataLoaded) return
    setScopeDataLoaded(true)
    try {
      const [deptRes, hostelRes] = await Promise.all([fetch('/api/org/departments'), fetch('/api/org/hostels')])
      const deptJson = await deptRes.json()
      const hostelJson = await hostelRes.json()
      if (deptJson.ok) setDepartments(deptJson.departments)
      if (hostelJson.ok) setHostels(hostelJson.hostels)
    } catch { /* scope pickers just show empty state if this fails */ }
  }
  function toggleDeptId(id: string) { setSDepartmentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  function toggleHostelId(id: string) { setSHostelIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  // ── Assign Role tab: existing staff member gets an appointment ────
  const [arQuery,     setArQuery]     = useState('')
  const [arCandidates, setArCandidates] = useState<any[]>([])
  const [arLoading,   setArLoading]   = useState(false)
  const [arSelected,  setArSelected]  = useState<any | null>(null)
  const [arType,      setArType]      = useState<AppointmentTypeId | ''>('')
  const [arScopeIds,  setArScopeIds]  = useState<string[]>([])
  const [arAssigning, setArAssigning] = useState(false)
  const [arError,     setArError]     = useState<string | null>(null)
  const [arSuccess,   setArSuccess]   = useState<string | null>(null)

  useEffect(() => {
    if (!arType || !HOSTEL_SCOPED_TYPES.has(arType)) return
    ensureScopeData()
  }, [arType])

  useEffect(() => {
    if (!arQuery.trim() || arSelected || !arType) { setArCandidates([]); return }
    const t = setTimeout(async () => {
      setArLoading(true)
      try {
        const res = await fetch(`/api/org/eligible-staff?appointmentType=${arType}`)
        const json = await res.json()
        const staff = json.ok ? json.staff : []
        setArCandidates(staff.filter((s: any) => s.full_name.toLowerCase().includes(arQuery.toLowerCase())))
      } finally { setArLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [arQuery, arType, arSelected])

  function toggleArScope(id: string) { setArScopeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  async function submitAssignRole() {
    if (!arSelected || !arType) { setArError('Pick a staff member and a role.'); return }
    if (HOSTEL_SCOPED_TYPES.has(arType) && arScopeIds.length === 0) { setArError('Select at least one hostel.'); return }
    setArAssigning(true); setArError(null)
    try {
      const body: Record<string, unknown> = { profileId: arSelected.id, appointmentType: arType }
      if (HOSTEL_SCOPED_TYPES.has(arType)) body.hostelIds = arScopeIds
      const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!json.ok) { setArError(json.error ?? 'Could not assign role.'); return }
      setArSuccess(`${arSelected.full_name} is now ${APPOINTMENT_TYPES[arType].label}.`)
      setArSelected(null); setArQuery(''); setArType(''); setArScopeIds([])
    } finally { setArAssigning(false) }
  }

  // ── Enrol single ──────────────────────────────────────────
  const [sRole,    setSRole]    = useState('student')
  const [sLoading, setSLoading] = useState(false)
  const [sError,   setSError]   = useState<string | null>(null)
  const [sResult,  setSResult]  = useState<{ full_name: string; email: string; role: string; code: string; warning?: string | null } | null>(null)

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
    setSAppointmentType(''); setSDepartmentId(''); setSDepartmentIds([]); setSPortfolio(''); setSHostelIds([])
    setSError(null)
  }

  async function regenerateCode(entry: CodeEntry) {
    setRegen(entry.id)
    try {
      const res = await fetch('/api/staff-codes/regenerate', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ profileId: entry.id }),
      })
      const data = await res.json()
      if (res.ok && data.code) {
        setEntries(p => p.map(e => e.id === entry.id ? { ...e, default_code: data.code } : e))
      }
    } catch {
      // Silently leave the old code in place; the button re-enables and
      // the user can retry.
    }
    setRegen(null)
  }

  async function copyCode(code: string, id: string) {
    await navigator.clipboard.writeText(code).catch(() => {})
    setCopied(id)
    setTimeout(() => setCopied(null), 2000)
  }

  async function handleEnrol() {
    if (!fName.trim() || !fEmail.trim()) { setSError('Full name and email are required.'); return }
    if (sRole === 'teacher' && sAppointmentType === 'hod' && !sDepartmentId) { setSError('Select a department for Head of Department.'); return }
    if (sRole === 'teacher' && sAppointmentType && HOSTEL_SCOPED_TYPES.has(sAppointmentType) && sHostelIds.length === 0) {
      setSError('Select at least one hostel.'); return
    }
    setSError(null); setSLoading(true)
    try {
      const usingAppointmentRoute = sRole === 'teacher' && !!sAppointmentType
      const res = await fetch(usingAppointmentRoute ? '/api/principal/enrol-with-role' : '/api/secretary/create-user', {
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
          ...(usingAppointmentRoute ? {
            appointmentType: sAppointmentType,
            departmentId:    sAppointmentType === 'hod' ? sDepartmentId : undefined,
            departmentIds:   sAppointmentType === 'vice_principal' ? sDepartmentIds : undefined,
            portfolio:       sAppointmentType === 'vice_principal' ? sPortfolio : undefined,
            hostelIds:       sAppointmentType && HOSTEL_SCOPED_TYPES.has(sAppointmentType) ? sHostelIds : undefined,
          } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Failed to create user')

      setSResult({ full_name: fName.trim(), email: fEmail.trim(), role: sRole, code: json.code, warning: json.warning ?? null })

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

  // ── FIX: Bulk Add now saves directly - no more "Preview Codes" stage that
  // showed fake, unsaved codes which looked real but didn't work at login.
  // One click = real users created in the database immediately.
  async function handleBulkSave() {
    const validRows = bRows.filter(r => r.full_name.trim() && r.email.trim() && ROLES_ASSIGNABLE.includes(r.role))
    if (!validRows.length) return

    setBLoading(true)
    // Seed bResults immediately so the UI shows "Saving..." rows, not nothing
    setBResults(validRows.map(r => ({ ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: '', saved: false, error: null })))

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
          if (!res.ok) return { ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: '', error: json.error ?? 'Failed', saved: false }
          return { ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: json.code, saved: true, error: null }
        } catch (e: any) {
          return { ...r, full_name: r.full_name.trim(), email: r.email.trim(), code: '', error: e.message ?? 'Network error', saved: false }
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
    const text = list.filter(r => r.saved).map(r => `${r.full_name} | ${roleMeta(r.role).label} | Code: ${r.code}`).join('\n')
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
      <button className={`${styles.roleChip} pressable`} onClick={() => setRoleTab(r)}
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
        {(['existing','enrol','assign-role','bulk'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSResult(null); setArError(null); setArSuccess(null) }}
            className={`pressable ${styles.tabBtn} ${tab === t ? styles.tabActive : ''}`}>
            {t === 'existing'    && 'All Codes'}
            {t === 'enrol'       && 'Enrol / Add User'}
            {t === 'assign-role' && 'Assign Role'}
            {t === 'bulk'        && 'Bulk Add'}
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
                      <button className={`${styles.actionBtn} pressable`} onClick={() => copyCode(e.default_code, e.id)}
                        style={copied === e.id ? { background: '#10B98122', borderColor: '#10B981', color: '#10B981' } : {}}>
                        {copied === e.id ? 'Copied' : 'Copy'}
                      </button>
                      <button className={`${styles.actionBtn} pressable`} onClick={() => regenerateCode(e)} disabled={regen === e.id}
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
                <p className={styles.formSub}>Fill in the details below. After saving, you will get the access code to share with them. They'll set their own password on first login.</p>
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Role *</label>
                <div className={styles.roleGrid}>
                  {ROLES_ASSIGNABLE.map(r => {
                    const m = roleMeta(r)
                    return (
                      <button key={r} onClick={() => setSRole(r)}
                        className={`pressable ${styles.roleOption}`}
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

              {sRole === 'teacher' && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Additional Role (optional)</label>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                    Give this teacher a leadership/welfare/operations role from day one, so their access code drops them straight into the right dashboard.
                  </p>
                  <select
                    className={`${styles.fieldInput} ${styles.fieldSelect}`}
                    value={sAppointmentType}
                    onChange={e => {
                      const val = e.target.value as AppointmentTypeId | ''
                      setSAppointmentType(val)
                      setSDepartmentId(''); setSDepartmentIds([]); setSPortfolio(''); setSHostelIds([])
                      if (val && (val === 'hod' || val === 'vice_principal' || HOSTEL_SCOPED_TYPES.has(val))) ensureScopeData()
                    }}>
                    <option value="">No additional role</option>
                    <option value="vice_principal">Vice Principal</option>
                    <option value="hod">Head of Department</option>
                    {CATEGORY_ORDER.map(cat => (
                      <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                        {APPOINTMENT_ROLE_TYPES.filter(t => APPOINTMENT_TYPES[t].category === cat).map(t => (
                          <option key={t} value={t}>{APPOINTMENT_TYPES[t].label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>

                  {sAppointmentType === 'hod' && (
                    <div style={{ marginTop: 10 }}>
                      <label className={styles.fieldLabel}>Department</label>
                      <select className={`${styles.fieldInput} ${styles.fieldSelect}`} value={sDepartmentId} onChange={e => setSDepartmentId(e.target.value)}>
                        <option value="">Select department...</option>
                        {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                      </select>
                    </div>
                  )}

                  {sAppointmentType === 'vice_principal' && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <input className={styles.fieldInput} placeholder="Portfolio (optional, e.g. Academics)" value={sPortfolio} onChange={e => setSPortfolio(e.target.value)} />
                      {departments.length > 0 && (
                        <div>
                          <label className={styles.fieldLabel}>Departments overseen (optional)</label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '30vh', overflowY: 'auto' }}>
                            {departments.map(d => (
                              <label key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                                <input type="checkbox" checked={sDepartmentIds.includes(d.id)} onChange={() => toggleDeptId(d.id)} />
                                {d.name}
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {sAppointmentType && HOSTEL_SCOPED_TYPES.has(sAppointmentType) && (
                    <div style={{ marginTop: 10 }}>
                      <label className={styles.fieldLabel}>Hostel(s)</label>
                      <HostelPicker
                        hostels={hostels}
                        selectedIds={sHostelIds}
                        onToggle={toggleHostelId}
                        onCreated={h => setHostels(prev => [...prev, h])}
                      />
                    </div>
                  )}
                </div>
              )}

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

              <button onClick={handleEnrol} disabled={sLoading} className={`${styles.generateBtn} pressable`}>
                {sLoading ? 'Saving...' : `Enrol ${sRole === 'teacher' && sAppointmentType ? APPOINTMENT_TYPES[sAppointmentType].label : roleMeta(sRole).label} & Get Code`}
              </button>
            </div>
          )}
        </>
      )}

      {/* ── ASSIGN ROLE (existing staff, instant, no code) ── */}
      {tab === 'assign-role' && (
        <div className={styles.formCard}>
          <div className={styles.formHeader}>
            <p className={styles.formTitle}>Assign a Role to Existing Staff</p>
            <p className={styles.formSub}>Pick a teacher who already has an account and give them an appointment role. Takes effect immediately - no code, no new account.</p>
          </div>

          {arSuccess && (
            <div className={styles.errorMsg} style={{ borderColor: '#10B98144', background: '#10B9810a', color: '#10B981', marginBottom: 'var(--space-3)' }}>
              {arSuccess}
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label className={styles.fieldLabel}>Role</label>
            <select
              className={`${styles.fieldInput} ${styles.fieldSelect}`}
              value={arType}
              onChange={e => { setArType(e.target.value as AppointmentTypeId | ''); setArSelected(null); setArQuery(''); setArScopeIds([]); setArError(null); setArSuccess(null) }}>
              <option value="">Select a role...</option>
              <option value="vice_principal">Vice Principal</option>
              <option value="hod">Head of Department</option>
              {CATEGORY_ORDER.map(cat => (
                <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                  {APPOINTMENT_ROLE_TYPES.filter(t => APPOINTMENT_TYPES[t].category === cat).map(t => (
                    <option key={t} value={t}>{APPOINTMENT_TYPES[t].label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {arType === 'hod' || arType === 'vice_principal' ? (
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              {arType === 'hod' ? 'Head of Department' : 'Vice Principal'} has its own department/portfolio setup - use{' '}
              <a href="/dashboard/principal/leadership" style={{ color: 'var(--brand)' }}>Leadership &amp; Appointments</a> for this one.
            </p>
          ) : arType ? (
            <>
              {!arSelected ? (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Staff Member</label>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}><SearchIcon size={14} /></span>
                    <input
                      className={styles.fieldInput}
                      style={{ paddingLeft: 32 }}
                      value={arQuery}
                      onChange={e => setArQuery(e.target.value)}
                      placeholder="Search by name"
                    />
                  </div>
                  {arLoading && <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>Searching…</p>}
                  {!arLoading && arQuery.trim() && arCandidates.length === 0 && (
                    <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6 }}>No eligible teacher found (already holding this role is excluded).</p>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                    {arCandidates.map(s => (
                      <button key={s.id} onClick={() => setArSelected(s)}
                        className="pressable"
                        style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, border: 'none', background: 'var(--glass-bg)', cursor: 'pointer', textAlign: 'left' }}>
                        <UserIcon size={14} /> {s.full_name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Staff Member</label>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 10, background: 'var(--glass-bg)' }}>
                    <span style={{ fontWeight: 700, fontSize: '0.86rem' }}>{arSelected.full_name}</span>
                    <button onClick={() => setArSelected(null)} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontSize: '0.78rem', cursor: 'pointer' }}>Change</button>
                  </div>
                </div>
              )}

              {arType && HOSTEL_SCOPED_TYPES.has(arType) && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Hostel(s)</label>
                  <HostelPicker
                    hostels={hostels}
                    selectedIds={arScopeIds}
                    onToggle={toggleArScope}
                    onCreated={h => setHostels(prev => [...prev, h])}
                  />
                </div>
              )}

              {arError && <p className={styles.errorMsg}>{arError}</p>}

              <button onClick={submitAssignRole} disabled={arAssigning || !arSelected} className={`${styles.generateBtn} pressable`}>
                {arAssigning ? 'Assigning…' : `Assign ${APPOINTMENT_TYPES[arType].label}`}
              </button>
            </>
          ) : null}
        </div>
      )}

      {/* ── BULK ADD ── */}
      {tab === 'bulk' && (
        <>
          <div className={styles.formCard} style={{ marginBottom: 'var(--space-5)' }}>
            <div className={styles.formHeader}>
              <p className={styles.formTitle}>Bulk Add Users</p>
              <p className={styles.formSub}>Fill in each row directly. Leave blank rows empty, they'll be ignored.</p>
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
                              <option value="">N/A</option>
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
                              <option value="">N/A</option>
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
                            <button className="pressable"
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

              <button className="pressable"
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
                className={`${styles.previewBtn} pressable`}
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
                  <p className={styles.formSub}>{bLoading ? 'Creating accounts, please wait...' : 'Codes below are live. Share them now.'}</p>
                </div>
                <div className={styles.bulkActions}>
                  <button className={`${styles.copyAllBtn} pressable`} onClick={() => copyAllCodes(bResults)}
                    disabled={bLoading}
                    style={copiedAll ? { borderColor: '#10B981', color: '#10B981' } : {}}>
                    {copiedAll ? 'All Copied' : 'Copy All'}
                  </button>
                  {bSaved && <span className={styles.savedBadge} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>All Saved <CheckIcon size={13} /></span>}
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
                      <code className={styles.codeChip} style={{ background: sc + '15', color: sc }}>{r.code || (bLoading ? '…' : 'N/A')}</code>
                      <span style={{ color: r.error ? '#EF4444' : r.saved ? '#10B981' : 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {r.error ? (r.error.length > 24 ? 'Error' : r.error) : r.saved ? <>Saved <CheckIcon size={12} /></> : bLoading ? 'Saving…' : 'Pending'}
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