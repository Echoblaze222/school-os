'use client'

import { useState, useEffect } from 'react'
import { useRealtimeTable } from '@/hooks/useRealtimeTable'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from './staff.module.css'
import KpiCard from '@/components/KpiCard'
import { CheckIcon, XIcon, AlertIcon, EditIcon, PeopleIcon } from '@/components/Icons'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from '@/lib/supabase/appointments-types'

// 'counselor' and 'admin' were never valid here - counselor is an
// appointment type (see Leadership & Appointments / the Assign Role tab
// on Enrolment & Codes), never a profiles.role value, and 'admin' isn't
// a role that exists anywhere in this app's schema. Neither was ever
// accepted by secretary/create-user's own permission check
// (ROLES_CALLER_CAN_ASSIGN.principal), so picking either here always
// 403'd - this predates any of the appointment-role work.
// librarian/nurse removed too, matching the same fix already made on
// Enrolment & Codes: those are appointment types now (their dashboards
// require an active appointment, not profiles.role), so creating them
// as a base account here would be a dead end with nowhere to log into -
// use the Assign Role tab on Enrolment & Codes for those instead.
const ROLES = ['teacher', 'bursar', 'secretary']
const ROLE_COLORS: Record<string, string> = {
  teacher: '#10B981', bursar: '#F59E0B', secretary: '#EC4899',
}

// Same appointment-role set as Enrolment & Codes' Additional Role picker
// and Assign Role tab - see that file for the full reasoning (excludes
// vice_principal/hod, which need their own department/portfolio scope
// UI, and the 4 student_leadership types, which need an existing
// student picked from the roster, never a new account).
const APPOINTMENT_ROLE_TYPES = (Object.keys(APPOINTMENT_TYPES) as AppointmentTypeId[])
  .filter(id => APPOINTMENT_TYPES[id].baseRoleScope.includes('teacher') && !['vice_principal', 'hod'].includes(id))
const CATEGORY_ORDER = ['welfare', 'ict', 'operations', 'hostel', 'academic']
const CATEGORY_LABELS: Record<string, string> = {
  welfare: 'Welfare', ict: 'ICT', operations: 'Operations',
  hostel: 'Hostel Staff', academic: 'Examination Committee',
}
const HOSTEL_SCOPED_TYPES = new Set<AppointmentTypeId>(['warden', 'assistant_warden', 'house_parent', 'hostel_administrator'])

// A non-JSON response (an HTML error/404 page) means the endpoint isn't
// actually deployed, or the server threw before returning JSON - either
// way "Unexpected token '<' is not valid JSON" is useless to see as an
// error message. This gives a plain-language reason instead.
async function safeJson(res: Response): Promise<any> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(
      res.status === 404
        ? `This feature isn't deployed yet on the server (404 at ${new URL(res.url).pathname}).`
        : `Server error (status ${res.status}) - the response wasn't valid JSON.`
    )
  }
}

interface Props { profile: any; school: any; userId: string }

// ── Success modal shown after staff is added ─────────────────
function StaffSuccessModal({
  result, sc, onClose,
}: {
  result: { full_name: string; email: string; role: string; code: string; password: string; appointedAs?: string | null }
  sc: string
  onClose: () => void
}) {
  const [copiedCode, setCopiedCode] = useState(false)
  const [copiedPwd,  setCopiedPwd]  = useState(false)
  const [copiedAll,  setCopiedAll]  = useState(false)
  const roleColor  = ROLE_COLORS[result.role] ?? sc
  const initials   = result.full_name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const roleLabel  = result.role.charAt(0).toUpperCase() + result.role.slice(1)

  async function copy(text: string, which: 'code' | 'pwd' | 'all') {
    await navigator.clipboard.writeText(text).catch(() => {})
    if (which === 'code') { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000) }
    else if (which === 'pwd') { setCopiedPwd(true); setTimeout(() => setCopiedPwd(false), 2000) }
    else { setCopiedAll(true); setTimeout(() => setCopiedAll(false), 2500) }
  }

  function copyAllDetails() {
    const text = `Name: ${result.full_name}\nRole: ${roleLabel}\nEmail: ${result.email}\nAccess Code: ${result.code}\nTemp Password: ${result.password}`
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
          <h3 className={styles.dialogTitle} style={{ marginBottom: 4 }}>Staff Added!</h3>
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
            width: 38, height: 38, borderRadius: '50%',
            background: roleColor + '22', color: roleColor,
            fontWeight: 700, fontSize: '0.85rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{initials}</div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-base)' }}>{result.full_name}</p>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {result.email} · <span style={{ color: roleColor, fontWeight: 600 }}>{roleLabel}</span>
              {result.appointedAs && <> · <span style={{ color: sc, fontWeight: 600 }}>{result.appointedAs}</span></>}
            </p>
          </div>
        </div>

        {/* Access Code */}
        <div style={{
          border: `1px solid ${roleColor}44`, background: roleColor + '0a',
          borderRadius: 10, padding: '12px 14px', marginBottom: 10,
        }}>
          <p style={{ margin: '0 0 6px', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Access Code
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <code style={{
              flex: 1, fontSize: '1.15rem', fontWeight: 800, letterSpacing: '0.08em',
              color: roleColor, fontFamily: 'monospace',
            }}>{result.code}</code>
            <button className="pressable"
              onClick={() => copy(result.code, 'code')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                background: copiedCode ? '#10B98122' : 'transparent',
                border: `1px solid ${copiedCode ? '#10B981' : roleColor + '55'}`,
                color: copiedCode ? '#10B981' : roleColor,
              }}
            >
              {copiedCode ? <><CheckIcon size={13} /> Copied</> : 'Copy'}
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
            <button className="pressable"
              onClick={() => copy(result.password, 'pwd')}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                background: copiedPwd ? '#10B98122' : 'transparent',
                border: `1px solid ${copiedPwd ? '#10B981' : '#F59E0B55'}`,
                color: copiedPwd ? '#10B981' : '#F59E0B',
              }}
            >
              {copiedPwd ? <><CheckIcon size={13} /> Copied</> : 'Copy'}
            </button>
          </div>
          <p style={{ margin: '8px 0 0', fontSize: '0.72rem', color: '#F59E0B', opacity: 0.85, display: 'flex', alignItems: 'center', gap: 5 }}>
            <AlertIcon size={13} /> Staff must change this password on first login.
          </p>
        </div>

        {/* Actions */}
        <button className="pressable"
          onClick={copyAllDetails}
          style={{
            width: '100%', padding: '10px', borderRadius: 8, marginBottom: 8,
            fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
            background: copiedAll ? '#10B98122' : 'var(--glass-bg)',
            border: `1px solid ${copiedAll ? '#10B981' : 'var(--glass-border)'}`,
            color: copiedAll ? '#10B981' : 'var(--text-base)',
          }}
        >
          {copiedAll ? <><CheckIcon size={13} /> All Details Copied</> : 'Copy All Details'}
        </button>
        <button
          onClick={onClose}
          className={`${styles.saveBtn} pressable`}
          style={{ width: '100%', background: sc }}
        >
          Done, Add Another
        </button>
      </div>
    </div>
  )
}

export default function StaffClient({ profile, school, userId }: Props) {
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#800020'

  const [staff, setStaff] = useRealtimeTable<any>({
    table:   'profiles',
    filter:  school?.id ? `school_id=eq.${school.id}` : undefined,
    initial: [],
    orderBy: (a, b) => (a.full_name ?? '').localeCompare(b.full_name ?? ''),
  })

  const [loading,    setLoading]    = useState(false)
  const [search,     setSearch]     = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [showForm,   setShowForm]   = useState(false)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)
  const [confirmDel, setConfirmDel] = useState<any | null>(null)
  const [saving,     setSaving]     = useState(false)
  const [addResult,  setAddResult]  = useState<{ full_name: string; email: string; role: string; code: string; password: string; appointedAs?: string | null } | null>(null)
  // ── Preview / Edit bottom sheets ───────────────────────────
  const [previewMember, setPreviewMember] = useState<any | null>(null)
  const [editMember,    setEditMember]    = useState<any | null>(null)
  const [editForm,      setEditForm]      = useState<any>({})
  const [editSaving,    setEditSaving]    = useState(false)

  const [form, setForm] = useState({
    full_name: '', email: '', phone: '', role: 'teacher',
    subject: '', qualification: '', gender: '', date_of_birth: '',
  })

  // ── Additional appointment role (new-hire add flow) ─────
  const [appointmentType, setAppointmentType] = useState<AppointmentTypeId | ''>('')
  const [hostelIds, setHostelIds] = useState<string[]>([])
  const [hostels, setHostels] = useState<{ id: string; name: string }[]>([])
  const [hostelsLoaded, setHostelsLoaded] = useState(false)

  async function ensureHostels() {
    if (hostelsLoaded) return
    setHostelsLoaded(true)
    try {
      const res = await fetch('/api/org/hostels')
      const json = await res.json()
      if (json.ok) setHostels(json.hostels)
    } catch { /* hostel picker just shows empty state if this fails */ }
  }
  function toggleHostelId(id: string) { setHostelIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  // ── Assign Role: give an existing staff member an appointment ────
  const [assignFor, setAssignFor] = useState<any | null>(null)
  const [assignType, setAssignType] = useState<AppointmentTypeId | ''>('')
  const [assignHostelIds, setAssignHostelIds] = useState<string[]>([])
  const [assigning, setAssigning] = useState(false)
  const [assignError, setAssignError] = useState<string | null>(null)

  function openAssignRole(member: any) {
    setAssignFor(member); setAssignType(''); setAssignHostelIds([]); setAssignError(null)
  }
  function toggleAssignHostelId(id: string) { setAssignHostelIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }

  async function submitAssignRole() {
    if (!assignFor || !assignType) { setAssignError('Pick a role.'); return }
    if (HOSTEL_SCOPED_TYPES.has(assignType) && assignHostelIds.length === 0) { setAssignError('Select at least one hostel.'); return }
    setAssigning(true); setAssignError(null)
    try {
      const body: Record<string, unknown> = { profileId: assignFor.id, appointmentType: assignType }
      if (HOSTEL_SCOPED_TYPES.has(assignType)) body.hostelIds = assignHostelIds
      const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await safeJson(res)
      if (!json.ok) { setAssignError(json.error ?? 'Could not assign role.'); return }
      showToast(`${assignFor.full_name} is now ${APPOINTMENT_TYPES[assignType].label}.`)
      setAssignFor(null)
    } catch (err: any) {
      setAssignError(err.message ?? 'Could not assign role.')
    } finally { setAssigning(false) }
  }

  useEffect(() => {
    async function loadStaff() {
      if (!school?.id) return
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('school_id', school.id)
        .not('role', 'in', '(student,parent,principal)')
        .order('full_name')
      if (data) setStaff(data)
    }
    loadStaff()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id])

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  async function handleDelete(member: any) {
    // Defense in depth: never allow removing your own account from this
    // screen, and always scope the delete to this school. The staff list
    // is already filtered to this school's rows, but a delete should not
    // depend solely on that filter (or on RLS) being correct.
    if (member.id === userId) {
      showToast('You cannot remove your own account.', false)
      setConfirmDel(null)
      return
    }
    setDeleting(member.id)
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', member.id)
      .eq('school_id', school.id)
    setDeleting(null)
    setConfirmDel(null)
    if (error) { showToast('Failed to remove staff member', false); return }
    setStaff(prev => prev.filter(s => s.id !== member.id))
    showToast(`${member.full_name} removed`)
  }

  async function handleCreate() {
    if (!form.full_name.trim() || !form.email.trim()) {
      showToast('Full name and email are required.', false)
      return
    }
    if (appointmentType && HOSTEL_SCOPED_TYPES.has(appointmentType) && hostelIds.length === 0) {
      showToast('Select at least one hostel for this role.', false)
      return
    }
    setSaving(true)
    try {
      const usingAppointmentRoute = form.role === 'teacher' && !!appointmentType
      const res  = await fetch(usingAppointmentRoute ? '/api/principal/enrol-with-role' : '/api/secretary/create-user', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          fullName:         form.full_name.trim(),
          email:            form.email.trim().toLowerCase(),
          role:             form.role,
          schoolId:         school.id,
          phone:            form.phone.trim()         || null,
          gender:           form.gender               || null,
          dateOfBirth:      form.date_of_birth        || null,
          qualification:    form.qualification.trim() || null,
          subjectSpecialty: form.role === 'teacher' ? (form.subject.trim() || null) : null,
          ...(usingAppointmentRoute ? {
            appointmentType,
            hostelIds: HOSTEL_SCOPED_TYPES.has(appointmentType) ? hostelIds : undefined,
          } : {}),
        }),
      })
      const json = await safeJson(res)
      if (!res.ok) throw new Error(json.error ?? 'Failed to add staff member')
      if (json.warning) showToast(json.warning, false)

      // Refresh list
      const { data: fresh } = await supabase
        .from('profiles').select('*')
        .eq('school_id', school.id)
        .not('role', 'in', '(student,parent)')
        .order('full_name')
      if (fresh) setStaff(fresh)

      const captured = { ...form }
      const appointedAs = usingAppointmentRoute && appointmentType ? APPOINTMENT_TYPES[appointmentType].label : null
      setForm({ full_name: '', email: '', phone: '', role: 'teacher', subject: '', qualification: '', gender: '', date_of_birth: '' })
      setAppointmentType(''); setHostelIds([])
      setShowForm(false)
      setAddResult({
        full_name: captured.full_name.trim(),
        email:     captured.email.trim(),
        role:      captured.role,
        code:      json.code,
        password:  json.password,
        appointedAs,
      })
    } catch (err: any) {
      showToast(err.message ?? 'Failed to add staff member', false)
    }
    setSaving(false)
  }

  // ── Save edited staff details ───────────────────────────────
  async function handleEditSave() {
    if (!editMember) return
    setEditSaving(true)

    const profileUpdate: any = {}
    const f = editForm
    if ('full_name'     in f) profileUpdate.full_name     = f.full_name     || editMember.full_name
    if ('phone'         in f) profileUpdate.phone         = f.phone         || null
    if ('date_of_birth' in f) profileUpdate.date_of_birth = f.date_of_birth || null
    if ('gender'        in f) profileUpdate.gender        = f.gender        || null
    if ('qualification' in f) profileUpdate.qualification = f.qualification || null
    if ('subject'       in f) profileUpdate.subject       = f.subject       || null
    if ('address'       in f) profileUpdate.address       = f.address       || null
    if ('role'          in f) profileUpdate.role          = f.role          || editMember.role

    const { error } = await supabase.from('profiles').update(profileUpdate).eq('id', editMember.id)
    setEditSaving(false)
    if (error) { showToast('Failed to save changes', false); return }

    const merged = { ...editMember, ...profileUpdate }
    setStaff(prev => prev.map(s => s.id === editMember.id ? merged : s))
    setPreviewMember(merged)
    setEditMember(null)
    setEditForm({})
    showToast('Staff details updated')
  }

  const filtered = staff.filter(s => {
    const q = search.toLowerCase()
    const matchesSearch = !search ||
      s.full_name?.toLowerCase().includes(q) ||
      s.email?.toLowerCase().includes(q) ||
      s.subject?.toLowerCase().includes(q)
    const matchesRole = !roleFilter || s.role === roleFilter
    return matchesSearch && matchesRole
  })

  const roleCounts = ROLES.reduce((acc, r) => {
    acc[r] = staff.filter(s => s.role === r).length
    return acc
  }, {} as Record<string, number>)

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Staff">
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? <CheckIcon size={14} /> : <XIcon size={14} />} {toast.msg}
        </div>
      )}

      {/* Code + password modal after adding staff */}
      {addResult && (
        <StaffSuccessModal
          result={addResult}
          sc={sc}
          onClose={() => setAddResult(null)}
        />
      )}

      {confirmDel && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Remove Staff Member?</h3>
            <p className={styles.dialogBody}>
              This will permanently remove <strong>{confirmDel.full_name}</strong> from the school.
              Their login access will be revoked.
            </p>
            <div className={styles.dialogActions}>
              <button className={`${styles.cancelBtn} pressable`} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button
                className={`${styles.deleteBtn} pressable`}
                onClick={() => handleDelete(confirmDel)}
                disabled={deleting === confirmDel.id}
              >
                {deleting === confirmDel.id ? 'Removing…' : 'Yes, Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.container}>
        {/* Stats strip */}
        <div className={styles.statsRow}>
          <KpiCard label="Total Staff" value={staff.length} icon={<PeopleIcon size={16} />} color={sc} />
          {Object.entries(roleCounts).filter(([, c]) => c > 0).map(([r, c]) => (
            <KpiCard key={r} label={`${r.charAt(0).toUpperCase() + r.slice(1)}s`} value={c} icon={<PeopleIcon size={16} />} color={ROLE_COLORS[r] ?? sc} valueColor={ROLE_COLORS[r] ?? sc} />
          ))}
        </div>

        {/* Toolbar */}
        <div className={styles.toolbar}>
          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className={styles.searchInput}
              placeholder="Search staff…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <select
            className={styles.filterSelect}
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
          >
            <option value="">All Roles</option>
            {ROLES.map(r => (
              <option key={r} value={r} style={{ textTransform: 'capitalize' }}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </option>
            ))}
          </select>
          <button className={`${styles.addBtn} pressable`} style={{ background: sc }} onClick={() => setShowForm(v => !v)}>
            {showForm ? <><XIcon size={14} /> Close</> : '+ Add Staff'}
          </button>
        </div>

        {/* Add form */}
        {showForm && (
          <div className={styles.formCard}>
            <p className={styles.formTitle}>Add New Staff Member</p>
            <div className={styles.formGrid}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Full Name *</label>
                <input className={styles.fieldInput} placeholder="e.g. John Adeyemi" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Email *</label>
                <input className={styles.fieldInput} type="email" placeholder="john@school.edu.ng" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Phone</label>
                <input className={styles.fieldInput} placeholder="080xxxxxxxx" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Role *</label>
                <select className={styles.fieldInput} value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => (
                    <option key={r} value={r} style={{ textTransform: 'capitalize' }}>
                      {r.charAt(0).toUpperCase() + r.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Gender</label>
                <select className={styles.fieldInput} value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Date of Birth</label>
                <input className={styles.fieldInput} type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))}/>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Qualification</label>
                <input className={styles.fieldInput} placeholder="e.g. B.Sc Education" value={form.qualification} onChange={e => setForm(f => ({ ...f, qualification: e.target.value }))}/>
              </div>
              {form.role === 'teacher' && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Subject Specialty</label>
                  <input className={styles.fieldInput} placeholder="e.g. Mathematics, Physics" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}/>
                </div>
              )}
            </div>

            {form.role === 'teacher' && (
              <div className={styles.fieldGroup} style={{ marginTop: 12 }}>
                <label className={styles.fieldLabel}>Additional Role (optional)</label>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '0 0 8px' }}>
                  Give this teacher a leadership/welfare/operations role from day one, so their access code drops them straight into the right dashboard.
                </p>
                <select
                  className={styles.fieldInput}
                  value={appointmentType}
                  onChange={e => {
                    const val = e.target.value as AppointmentTypeId | ''
                    setAppointmentType(val); setHostelIds([])
                    if (val && HOSTEL_SCOPED_TYPES.has(val)) ensureHostels()
                  }}>
                  <option value="">No additional role</option>
                  {CATEGORY_ORDER.map(cat => (
                    <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                      {APPOINTMENT_ROLE_TYPES.filter(t => APPOINTMENT_TYPES[t].category === cat).map(t => (
                        <option key={t} value={t}>{APPOINTMENT_TYPES[t].label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                  Vice Principal and Head of Department need department/portfolio setup - use{' '}
                  <a href="/dashboard/principal/leadership" style={{ color: sc }}>Leadership &amp; Appointments</a> for those.
                </p>

                {appointmentType && HOSTEL_SCOPED_TYPES.has(appointmentType) && (
                  <div style={{ marginTop: 10 }}>
                    <label className={styles.fieldLabel}>Hostel(s)</label>
                    {hostels.length === 0 ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No hostels exist yet.</p> : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '30vh', overflowY: 'auto' }}>
                        {hostels.map(h => (
                          <label key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                            <input type="checkbox" checked={hostelIds.includes(h.id)} onChange={() => toggleHostelId(h.id)} />
                            {h.name}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className={styles.formActions}>
              <button className={`${styles.cancelFormBtn} pressable`} onClick={() => setShowForm(false)}>Cancel</button>
              <button
                className={`${styles.saveBtn} pressable`}
                style={{ background: sc }}
                onClick={handleCreate}
                disabled={saving || !form.full_name.trim() || !form.email.trim()}
              >
                {saving ? 'Adding…' : 'Add & Get Code'}
              </button>
            </div>
          </div>
        )}

        {/* Staff list */}
        {loading ? (
          <div className={styles.loadingGrid}>
            {[1, 2, 3].map(i => <div key={i} className={styles.skeleton}/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="1.2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
            <p>{search || roleFilter ? 'No staff match your filters' : 'No staff added yet'}</p>
            {!showForm && (
              <button className={`${styles.addBtn} pressable`} style={{ background: sc, marginTop: 12 }} onClick={() => setShowForm(true)}>
                + Add First Staff Member
              </button>
            )}
          </div>
        ) : (
          <div className={`${styles.staffGrid} stagger`}>
            {filtered.map(member => {
              const initials  = member.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() ?? '?'
              const roleColor = ROLE_COLORS[member.role] ?? sc
              return (
                <div key={member.id} className={`${styles.staffCard} pressable animate-fade-up`} onClick={() => setPreviewMember(member)} style={{ cursor: 'pointer' }}>
                  <div className={styles.cardHeader}>
                    <div className={styles.avatar} style={{ background: roleColor + '30', color: roleColor }}>
                      {member.avatar_url
                        ? <img src={member.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}/>
                        : <span>{initials}</span>
                      }
                    </div>
                    <div className={styles.memberInfo}>
                      <p className={styles.memberName}>{member.full_name}</p>
                      <span className={styles.roleBadge} style={{ background: roleColor + '20', color: roleColor }}>
                        {member.role}
                      </span>
                    </div>
                    <button
                      className={`${styles.delBtn} pressable`}
                      onClick={() => setConfirmDel(member)}
                      title="Remove staff member"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                  <div className={styles.cardDetails}>
                    {member.email && (
                      <div className={styles.detailRow}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                        <span>{member.email}</span>
                      </div>
                    )}
                    {member.phone && (
                      <div className={styles.detailRow}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 8.81 19.79 19.79 0 01.00 2.19 2 2 0 012 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z"/></svg>
                        <span>{member.phone}</span>
                      </div>
                    )}
                    {member.subject && (
                      <div className={styles.detailRow}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 014 4v14a3 3 0 00-3-3H2z"/><path d="M22 3h-6a4 4 0 00-4 4v14a3 3 0 013-3h7z"/></svg>
                        <span>{member.subject}</span>
                      </div>
                    )}
                    {member.default_code && (
                      <div className={styles.codeChip}>
                        {member.default_code}
                      </div>
                    )}
                  </div>
                  <div className={styles.cardFooter}>
                    <span className={styles.joinDate}>
                      Joined {new Date(member.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }}/>
      </div>

      {/* ── Preview bottom sheet ─────────────────────────────── */}
      {previewMember && !editMember && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'flex-end' }}
          onClick={() => setPreviewMember(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:'var(--bg-card)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0', padding:'var(--space-6)', width:'100%', maxHeight:'85vh', overflowY:'auto' }}
          >
            <div style={{ width:40, height:4, borderRadius:2, background:'var(--glass-border)', margin:'0 auto var(--space-5)' }}/>

            {/* Avatar + name */}
            <div style={{ display:'flex', alignItems:'center', gap:'var(--space-4)', marginBottom:'var(--space-5)' }}>
              {(() => {
                const roleColor = ROLE_COLORS[previewMember.role] ?? sc
                const initials  = previewMember.full_name?.split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase() ?? '?'
                return (
                  <div style={{ width:56, height:56, borderRadius:'50%', flexShrink:0, overflow:'hidden', background:roleColor+'25', color:roleColor, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:'1.2rem' }}>
                    {previewMember.avatar_url ? <img src={previewMember.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/> : initials}
                  </div>
                )
              })()}
              <div>
                <p style={{ fontWeight:800, fontSize:'1.1rem', color:'var(--text-primary)', margin:0 }}>{previewMember.full_name}</p>
                <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'2px 10px', borderRadius:'var(--radius-full)', background:(ROLE_COLORS[previewMember.role]??sc)+'22', color:ROLE_COLORS[previewMember.role]??sc, textTransform:'capitalize' }}>
                  {previewMember.role}
                </span>
              </div>
            </div>

            {([
              ['Email',         previewMember.email],
              ['Phone',         previewMember.phone],
              ['Gender',        previewMember.gender],
              ['Date of Birth', previewMember.date_of_birth],
              ['Qualification', previewMember.qualification],
              ['Subject',       previewMember.subject],
              ['Address',       previewMember.address],
              ['Access Code',   previewMember.default_code],
              ['Joined',        previewMember.created_at ? new Date(previewMember.created_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'}) : null],
            ] as [string,string|null|undefined][]).map(([label, value]) => (
              <div key={label} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'var(--space-3) 0', borderBottom:'1px solid var(--glass-border)', gap:'var(--space-4)' }}>
                <span style={{ fontSize:'0.78rem', color:'var(--text-muted)', flexShrink:0 }}>{label}</span>
                {value
                  ? <span style={{ fontSize:'0.82rem', fontWeight:600, color:'var(--text-primary)', textAlign:'right' }}>{value}</span>
                  : <span style={{ fontSize:'0.78rem', color:'var(--text-faint)', fontStyle:'italic' }}>Not set</span>
                }
              </div>
            ))}

            <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-5)' }}>
              <button className={`${styles.saveBtn} pressable`} style={{ flex:1, background:sc }}
                onClick={() => { setEditMember(previewMember); setEditForm({}) }}>
                <EditIcon size={14} /> Edit Details
              </button>
              <button className={`${styles.cancelBtn} pressable`} onClick={() => setPreviewMember(null)}>Close</button>
            </div>
            {previewMember.role === 'teacher' && (
              <button className={`${styles.cancelBtn} pressable`} style={{ width: '100%', marginTop: 'var(--space-3)' }}
                onClick={() => { openAssignRole(previewMember); setPreviewMember(null) }}>
                Assign a Role…
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Edit bottom sheet ────────────────────────────────── */}
      {editMember && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', zIndex:1001, display:'flex', alignItems:'flex-end' }}
          onClick={() => { setEditMember(null); setEditForm({}) }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:'var(--bg-card)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0', padding:'var(--space-6)', width:'100%', maxHeight:'92vh', overflowY:'auto' }}
          >
            <div style={{ width:40, height:4, borderRadius:2, background:'var(--glass-border)', margin:'0 auto var(--space-5)' }}/>
            <p style={{ fontWeight:800, fontSize:'1rem', color:'var(--text-primary)', marginBottom:'var(--space-5)' }}>
              Edit: {editMember.full_name}
            </p>

            <div className={styles.formGrid}>
              {([
                ['Full Name',     'full_name',     'text', 'e.g. John Adeyemi'],
                ['Phone',         'phone',         'tel',  '080xxxxxxxx'],
                ['Date of Birth', 'date_of_birth', 'date', ''],
                ['Qualification', 'qualification', 'text', 'e.g. B.Sc Education'],
                ['Subject',       'subject',       'text', 'e.g. Mathematics'],
                ['Address',       'address',       'text', 'e.g. 12 Lagos Street'],
              ] as [string,string,string,string][]).map(([label, key, type, placeholder]) => (
                <div key={key} className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>{label}</label>
                  <input className={styles.fieldInput} type={type} placeholder={placeholder}
                    value={key in editForm ? editForm[key] : (editMember?.[key] ?? '')}
                    onChange={e => setEditForm((f:any) => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Gender</label>
                <select className={styles.fieldInput}
                  value={'gender' in editForm ? editForm.gender : (editMember?.gender ?? '')}
                  onChange={e => setEditForm((f:any) => ({ ...f, gender: e.target.value }))}>
                  <option value="">Select gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Role</label>
                <select className={styles.fieldInput}
                  value={'role' in editForm ? editForm.role : (editMember?.role ?? '')}
                  onChange={e => setEditForm((f:any) => ({ ...f, role: e.target.value }))}>
                  {ROLES.map(r => <option key={r} value={r} style={{ textTransform:'capitalize' }}>{r.charAt(0).toUpperCase()+r.slice(1)}</option>)}
                </select>
              </div>
            </div>

            <div className={styles.formActions}>
              <button className={`${styles.cancelFormBtn} pressable`} onClick={() => { setEditMember(null); setEditForm({}) }}>Cancel</button>
              <button className={`${styles.saveBtn} pressable`} style={{ background:sc }} onClick={handleEditSave} disabled={editSaving}>
                {editSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
      {assignFor && (
        <div
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'flex-end' }}
          onClick={() => setAssignFor(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ background:'var(--bg-card)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl) var(--radius-xl) 0 0', padding:'var(--space-6)', width:'100%', maxHeight:'85vh', overflowY:'auto' }}
          >
            <div style={{ width:40, height:4, borderRadius:2, background:'var(--glass-border)', margin:'0 auto var(--space-5)' }}/>
            <p style={{ fontWeight:800, fontSize:'1.05rem', color:'var(--text-primary)', margin:'0 0 4px' }}>Assign a Role</p>
            <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', margin:'0 0 var(--space-4)' }}>{assignFor.full_name} - takes effect immediately, no code needed.</p>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Role</label>
              <select
                className={styles.fieldInput}
                value={assignType}
                onChange={e => {
                  const val = e.target.value as AppointmentTypeId | ''
                  setAssignType(val); setAssignHostelIds([])
                  if (val && HOSTEL_SCOPED_TYPES.has(val)) ensureHostels()
                }}>
                <option value="">Select a role...</option>
                {CATEGORY_ORDER.map(cat => (
                  <optgroup key={cat} label={CATEGORY_LABELS[cat]}>
                    {APPOINTMENT_ROLE_TYPES.filter(t => APPOINTMENT_TYPES[t].category === cat).map(t => (
                      <option key={t} value={t}>{APPOINTMENT_TYPES[t].label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                Vice Principal and Head of Department need department/portfolio setup - use{' '}
                <a href="/dashboard/principal/leadership" style={{ color: sc }}>Leadership &amp; Appointments</a> for those.
              </p>
            </div>

            {assignType && HOSTEL_SCOPED_TYPES.has(assignType) && (
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Hostel(s)</label>
                {hostels.length === 0 ? <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>No hostels exist yet.</p> : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '30vh', overflowY: 'auto' }}>
                    {hostels.map(h => (
                      <label key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                        <input type="checkbox" checked={assignHostelIds.includes(h.id)} onChange={() => toggleAssignHostelId(h.id)} />
                        {h.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {assignError && <p style={{ fontSize: '0.8rem', color: '#EF4444', margin: '8px 0 0' }}>{assignError}</p>}

            <div style={{ display:'flex', gap:'var(--space-3)', marginTop:'var(--space-5)' }}>
              <button className={`${styles.saveBtn} pressable`} style={{ flex:1, background:sc }}
                onClick={submitAssignRole} disabled={assigning || !assignType}>
                {assigning ? 'Assigning…' : 'Assign Role'}
              </button>
              <button className={`${styles.cancelBtn} pressable`} onClick={() => setAssignFor(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </RolePageWrapper>
  )
}