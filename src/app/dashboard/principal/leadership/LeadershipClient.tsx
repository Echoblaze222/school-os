'use client'
// src/app/dashboard/principal/leadership/LeadershipClient.tsx

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import RolePageWrapper from '@/components/RolePageWrapper'
import DepartmentCard from '@/components/org/DepartmentCard'
import { PlusIcon, XIcon, UserIcon, CrownIcon, HomeIcon } from '@/components/Icons'
import { ripple } from '@/lib/ripple'
import motion from '@/components/dashboard-motion.module.css'
import type { DepartmentWithStats } from '@/lib/supabase/appointments'
import { APPOINTMENT_TYPES, type AppointmentTypeId } from '@/lib/supabase/appointments-types'
import styles from './leadership.module.css'

interface StaffOption { id: string; full_name: string; avatar_url: string | null; department_id: string | null }
interface Member { id: string; full_name: string; email: string; avatar_url: string | null; employee_id: string | null }
interface VicePrincipal {
  appointmentId: string; profileId: string; fullName: string
  avatarUrl: string | null; email: string; portfolio: string | null
  departmentIds: string[]; assignedAt: string
}
interface Hostel { id: string; name: string }
interface HostelPrefect {
  appointmentId: string; profileId: string; fullName: string
  avatarUrl: string | null; hostelIds: string[]; assignedAt: string
}
interface ClassOption { id: string; name: string }
interface GenericAppointee {
  appointmentId: string; profileId: string; fullName: string
  avatarUrl: string | null; hostelIds: string[]; classIds: string[]; assignedAt: string
}

interface Props {
  profile: any; school: any; userId: string
  initialDepartments: DepartmentWithStats[]
  initialVicePrincipals: VicePrincipal[]
  initialHostels: Hostel[]
  initialHostelPrefects: HostelPrefect[]
  initialClasses: ClassOption[]
  initialGenericAppointments: Record<string, GenericAppointee[]>
}

const PORTFOLIOS = [
  { value: '', label: 'No specific portfolio' },
  { value: 'academics', label: 'Academics' },
  { value: 'administration', label: 'Administration' },
  { value: 'student_affairs', label: 'Student Affairs' },
  { value: 'operations', label: 'Operations' },
]

// Bespoke sections above (Vice Principal, HOD, Hostel Prefect) each need
// their own scope input (departments / hostel-per-department / hostels).
// Everything else renders through the generic section below, one row per
// type, grouped by category - built once and reused for all 19 rather
// than 19 near-identical bespoke blocks.
const GENERIC_TYPES = (Object.keys(APPOINTMENT_TYPES) as AppointmentTypeId[])
  .filter(id => !['vice_principal', 'hod', 'hostel_prefect'].includes(id))
const CATEGORY_ORDER: string[] = ['welfare', 'ict', 'operations', 'hostel', 'academic', 'student_leadership']
const CATEGORY_LABELS: Record<string, string> = {
  welfare: 'Welfare', ict: 'ICT', operations: 'Operations',
  hostel: 'Hostel Staff', academic: 'Examination Committee', student_leadership: 'Student Leadership',
}
const HOSTEL_SCOPED_TYPES = new Set<AppointmentTypeId>(['warden', 'assistant_warden', 'house_parent', 'hostel_administrator'])
const CLASS_SCOPED_TYPES = new Set<AppointmentTypeId>(['class_prefect'])

export default function LeadershipClient({
  profile, school, userId, initialDepartments, initialVicePrincipals, initialHostels, initialHostelPrefects,
  initialClasses, initialGenericAppointments,
}: Props) {
  const router = useRouter()
  const [departments, setDepartments] = useState(initialDepartments)
  const [vicePrincipals, setVicePrincipals] = useState(initialVicePrincipals)
  const [hostelPrefects, setHostelPrefects] = useState(initialHostelPrefects)
  const [error, setError] = useState('')

  // Departments: create / edit
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState(''); const [newDesc, setNewDesc] = useState(''); const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<DepartmentWithStats | null>(null)
  const [editName, setEditName] = useState(''); const [editDesc, setEditDesc] = useState(''); const [saving, setSaving] = useState(false)

  // Departments: members panel
  const [membersPanel, setMembersPanel] = useState<DepartmentWithStats | null>(null)
  const [members, setMembers] = useState<Member[]>([]); const [loadingMembers, setLoadingMembers] = useState(false)

  // HOD picker (shared for any department, Principal has no scope limit)
  const [hodPicker, setHodPicker] = useState<DepartmentWithStats | null>(null)
  const [eligibleHods, setEligibleHods] = useState<StaffOption[]>([]); const [loadingEligible, setLoadingEligible] = useState(false)
  const [assigningHodId, setAssigningHodId] = useState<string | null>(null)
  const [revokingHodDeptId, setRevokingHodDeptId] = useState<string | null>(null)

  // VP appointment picker
  const [showVpPicker, setShowVpPicker] = useState(false)
  const [eligibleVps, setEligibleVps] = useState<StaffOption[]>([]); const [loadingVpEligible, setLoadingVpEligible] = useState(false)
  const [vpStep, setVpStep] = useState<'pick' | 'configure'>('pick')
  const [selectedVpCandidate, setSelectedVpCandidate] = useState<StaffOption | null>(null)
  const [vpPortfolio, setVpPortfolio] = useState('')
  const [vpDeptIds, setVpDeptIds] = useState<string[]>([])
  const [appointing, setAppointing] = useState(false)
  const [editingVpAppointmentId, setEditingVpAppointmentId] = useState<string | null>(null)
  const [revokingVpId, setRevokingVpId] = useState<string | null>(null)

  // Hostel Prefect appointment picker (same two-step shape as VP: pick
  // the student, then configure scope - here that's which hostel(s)
  // instead of portfolio/departments)
  const [showHpPicker, setShowHpPicker] = useState(false)
  const [eligibleHp, setEligibleHp] = useState<StaffOption[]>([]); const [loadingHpEligible, setLoadingHpEligible] = useState(false)
  const [hpStep, setHpStep] = useState<'pick' | 'configure'>('pick')
  const [selectedHpCandidate, setSelectedHpCandidate] = useState<StaffOption | null>(null)
  const [hpHostelIds, setHpHostelIds] = useState<string[]>([])
  const [appointingHp, setAppointingHp] = useState(false)
  const [revokingHpId, setRevokingHpId] = useState<string | null>(null)

  // Generic appointment picker: shared by all 19 types that don't need
  // their own bespoke section (see GENERIC_TYPES above). Most have no
  // scope at all (click a name, done); the hostel-staff and class-prefect
  // types add a 'configure' step for picking which hostel(s)/class the
  // appointment applies to, same shape as the HP picker above.
  const [genericAppointments, setGenericAppointments] = useState(initialGenericAppointments)
  const [genericPicker, setGenericPicker] = useState<{ type: AppointmentTypeId; step: 'pick' | 'configure' } | null>(null)
  const [genericCandidates, setGenericCandidates] = useState<StaffOption[]>([])
  const [loadingGenericCandidates, setLoadingGenericCandidates] = useState(false)
  const [selectedGenericCandidate, setSelectedGenericCandidate] = useState<StaffOption | null>(null)
  const [genericScopeIds, setGenericScopeIds] = useState<string[]>([])
  const [appointingGeneric, setAppointingGeneric] = useState(false)
  const [assigningGenericCandidateId, setAssigningGenericCandidateId] = useState<string | null>(null)
  const [revokingGenericId, setRevokingGenericId] = useState<string | null>(null)

  async function refreshDepartments() {
    const res = await fetch('/api/org/departments'); const json = await res.json()
    if (json.ok) setDepartments(json.departments)
  }

  // ── Department CRUD ──
  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/org/departments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName, description: newDesc || undefined }) })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not create department.'); return }
      setNewName(''); setNewDesc(''); setShowCreate(false); await refreshDepartments()
    } finally { setCreating(false) }
  }
  function openEdit(d: DepartmentWithStats) { setEditing(d); setEditName(d.name); setEditDesc(d.description ?? ''); setError('') }
  async function handleSaveEdit() {
    if (!editing) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/org/departments/${editing.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: editName, description: editDesc || null }) })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not save changes.'); return }
      setEditing(null); await refreshDepartments()
    } finally { setSaving(false) }
  }
  async function handleDelete(d: DepartmentWithStats) {
    if (!confirm(`Delete "${d.name}"? Members will be unassigned and any Head of Department appointment for it will be revoked. This can't be undone.`)) return
    const res = await fetch(`/api/org/departments/${d.id}`, { method: 'DELETE' }); const json = await res.json()
    if (!json.ok) { setError(json.error ?? 'Could not delete department.'); return }
    await refreshDepartments()
  }
  async function openMembers(d: DepartmentWithStats) {
    setMembersPanel(d); setLoadingMembers(true); setError('')
    try {
      const res = await fetch(`/api/org/departments/${d.id}`); const json = await res.json()
      if (json.ok) setMembers(json.members)
    } finally { setLoadingMembers(false) }
  }

  // ── HOD assignment (any department, no scope limit) ──
  async function openHodPicker(d: DepartmentWithStats) {
    setHodPicker(d); setLoadingEligible(true); setError('')
    try {
      const res = await fetch('/api/org/eligible-staff?appointmentType=hod'); const json = await res.json()
      if (json.ok) setEligibleHods(json.staff)
    } finally { setLoadingEligible(false) }
  }
  async function assignHod(staffId: string) {
    if (!hodPicker || assigningHodId) return
    setAssigningHodId(staffId); setError('')
    try {
      const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ profileId: staffId, appointmentType: 'hod', departmentId: hodPicker.id }) })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not assign Head of Department.'); return }
      setHodPicker(null); await refreshDepartments(); router.refresh()
    } finally { setAssigningHodId(null) }
  }
  async function revokeHod(d: DepartmentWithStats) {
    if (!d.hod || !confirm(`Remove ${d.hod.full_name} as Head of Department of ${d.name}?`)) return
    setRevokingHodDeptId(d.id); setError('')
    try {
      const res = await fetch('/api/appointments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: d.hod.appointment_id }) })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not revoke appointment.'); return }
      await refreshDepartments()
    } finally { setRevokingHodDeptId(null) }
  }

  // ── Vice Principal appointment ──
  async function openVpPicker() {
    setShowVpPicker(true); setVpStep('pick'); setLoadingVpEligible(true); setError('')
    try {
      const res = await fetch('/api/org/eligible-staff?appointmentType=vice_principal'); const json = await res.json()
      if (json.ok) setEligibleVps(json.staff.filter((s: StaffOption) => !vicePrincipals.some(vp => vp.profileId === s.id)))
    } finally { setLoadingVpEligible(false) }
  }
  function pickVpCandidate(s: StaffOption) { setSelectedVpCandidate(s); setVpPortfolio(''); setVpDeptIds([]); setVpStep('configure') }
  function toggleVpDept(id: string) { setVpDeptIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  // Reopen an already-appointed VP straight on the configure step,
  // pre-filled with their current scope - this is what was missing:
  // previously the only way to change a VP's departments after the
  // fact was Revoke + re-appoint from scratch.
  function openEditVp(vp: VicePrincipal) {
    setSelectedVpCandidate({ id: vp.profileId, full_name: vp.fullName, avatar_url: vp.avatarUrl, department_id: null })
    setVpPortfolio(vp.portfolio ?? '')
    setVpDeptIds(vp.departmentIds)
    setEditingVpAppointmentId(vp.appointmentId)
    setVpStep('configure')
    setShowVpPicker(true)
    setError('')
  }
  function closeVpModal() { setShowVpPicker(false); setEditingVpAppointmentId(null) }
  async function confirmAppointVp() {
    if (!selectedVpCandidate) return
    setAppointing(true); setError('')
    try {
      if (editingVpAppointmentId) {
        const res = await fetch('/api/appointments', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ appointmentId: editingVpAppointmentId, portfolio: vpPortfolio || undefined, departmentIds: vpDeptIds }),
        })
        const json = await res.json()
        if (!json.ok) { setError(json.error ?? 'Could not update Vice Principal.'); return }
        setVicePrincipals(prev => prev.map(x => x.appointmentId === editingVpAppointmentId
          ? { ...x, portfolio: vpPortfolio || null, departmentIds: vpDeptIds }
          : x))
        closeVpModal(); router.refresh()
        return
      }
      const res = await fetch('/api/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedVpCandidate.id, appointmentType: 'vice_principal', portfolio: vpPortfolio || undefined, departmentIds: vpDeptIds }),
      })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not appoint Vice Principal.'); return }
      setVicePrincipals(prev => [...prev, {
        appointmentId: json.appointment.id, profileId: selectedVpCandidate.id, fullName: selectedVpCandidate.full_name,
        avatarUrl: selectedVpCandidate.avatar_url, email: '', portfolio: vpPortfolio || null, departmentIds: vpDeptIds, assignedAt: new Date().toISOString(),
      }])
      setShowVpPicker(false); router.refresh()
    } finally { setAppointing(false) }
  }
  async function revokeVp(vp: VicePrincipal) {
    if (!confirm(`Remove ${vp.fullName} as Vice Principal? They will lose access to the Vice Principal dashboard immediately.`)) return
    setRevokingVpId(vp.appointmentId); setError('')
    try {
      const res = await fetch('/api/appointments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: vp.appointmentId }) })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not revoke appointment.'); return }
      setVicePrincipals(prev => prev.filter(x => x.appointmentId !== vp.appointmentId)); router.refresh()
    } finally { setRevokingVpId(null) }
  }

  // ── Hostel Prefect appointment ──
  async function openHpPicker() {
    setShowHpPicker(true); setHpStep('pick'); setLoadingHpEligible(true); setError('')
    try {
      const res = await fetch('/api/org/eligible-staff?appointmentType=hostel_prefect'); const json = await res.json()
      if (json.ok) setEligibleHp(json.staff.filter((s: StaffOption) => !hostelPrefects.some(hp => hp.profileId === s.id)))
      else setError(json.error ?? 'Could not load students.')
    } finally { setLoadingHpEligible(false) }
  }
  function pickHpCandidate(s: StaffOption) { setSelectedHpCandidate(s); setHpHostelIds([]); setHpStep('configure') }
  function toggleHpHostel(id: string) { setHpHostelIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  async function confirmAppointHp() {
    if (!selectedHpCandidate || hpHostelIds.length === 0) return
    setAppointingHp(true); setError('')
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: selectedHpCandidate.id, appointmentType: 'hostel_prefect', hostelIds: hpHostelIds }),
      })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not appoint Hostel Prefect.'); return }
      setHostelPrefects(prev => [...prev, {
        appointmentId: json.appointment.id, profileId: selectedHpCandidate.id, fullName: selectedHpCandidate.full_name,
        avatarUrl: selectedHpCandidate.avatar_url, hostelIds: hpHostelIds, assignedAt: new Date().toISOString(),
      }])
      setShowHpPicker(false); router.refresh()
    } finally { setAppointingHp(false) }
  }
  async function revokeHp(hp: HostelPrefect) {
    if (!confirm(`Remove ${hp.fullName} as Hostel Prefect? They will immediately lose access to the roll call view.`)) return
    setRevokingHpId(hp.appointmentId); setError('')
    try {
      const res = await fetch('/api/appointments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId: hp.appointmentId }) })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not revoke appointment.'); return }
      setHostelPrefects(prev => prev.filter(x => x.appointmentId !== hp.appointmentId)); router.refresh()
    } finally { setRevokingHpId(null) }
  }

  // ── Generic appointment types (everything but VP / HOD / Hostel Prefect) ──
  async function openGenericPicker(type: AppointmentTypeId) {
    setGenericPicker({ type, step: 'pick' }); setSelectedGenericCandidate(null); setGenericScopeIds([])
    setLoadingGenericCandidates(true); setError('')
    try {
      const res = await fetch(`/api/org/eligible-staff?appointmentType=${type}`)
      const json = await res.json()
      setGenericCandidates(json.ok ? json.staff : [])
    } finally { setLoadingGenericCandidates(false) }
  }
  function closeGenericPicker() { setGenericPicker(null); setSelectedGenericCandidate(null); setGenericScopeIds([]) }
  function toggleGenericScope(id: string) { setGenericScopeIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]) }
  function pickGenericCandidate(s: StaffOption) {
    if (!genericPicker) return
    // Unscoped types assign immediately on click - no second step to
    // click through for a role that has nothing to configure.
    if (HOSTEL_SCOPED_TYPES.has(genericPicker.type) || CLASS_SCOPED_TYPES.has(genericPicker.type)) {
      setSelectedGenericCandidate(s); setGenericPicker({ type: genericPicker.type, step: 'configure' })
    } else {
      assignGeneric(genericPicker.type, s)
    }
  }
  async function assignGeneric(type: AppointmentTypeId, candidate: StaffOption, scopeIds?: string[]) {
    setAppointingGeneric(true); setAssigningGenericCandidateId(candidate.id); setError('')
    try {
      const body: Record<string, unknown> = { profileId: candidate.id, appointmentType: type }
      if (HOSTEL_SCOPED_TYPES.has(type)) {
        if (!scopeIds || scopeIds.length === 0) { setError('Select at least one hostel.'); return }
        body.hostelIds = scopeIds
      }
      if (CLASS_SCOPED_TYPES.has(type)) {
        if (!scopeIds || scopeIds.length === 0) { setError('Select at least one class.'); return }
        body.classIds = scopeIds
      }
      const res = await fetch('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? `Could not appoint ${APPOINTMENT_TYPES[type].label}.`); return }
      setGenericAppointments(prev => ({
        ...prev,
        [type]: [...(prev[type] ?? []), {
          appointmentId: json.appointment.id, profileId: candidate.id, fullName: candidate.full_name,
          avatarUrl: candidate.avatar_url,
          hostelIds: HOSTEL_SCOPED_TYPES.has(type) ? (scopeIds ?? []) : [],
          classIds: CLASS_SCOPED_TYPES.has(type) ? (scopeIds ?? []) : [],
          assignedAt: new Date().toISOString(),
        }],
      }))
      closeGenericPicker(); router.refresh()
    } finally { setAppointingGeneric(false); setAssigningGenericCandidateId(null) }
  }
  function confirmGenericConfigure() {
    if (!genericPicker || !selectedGenericCandidate) return
    assignGeneric(genericPicker.type, selectedGenericCandidate, genericScopeIds)
  }
  async function revokeGeneric(type: AppointmentTypeId, appointmentId: string, fullName: string) {
    if (!confirm(`Remove ${fullName} as ${APPOINTMENT_TYPES[type].label}?`)) return
    setRevokingGenericId(appointmentId); setError('')
    try {
      const res = await fetch('/api/appointments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ appointmentId }) })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not revoke appointment.'); return }
      setGenericAppointments(prev => ({ ...prev, [type]: (prev[type] ?? []).filter(a => a.appointmentId !== appointmentId) })); router.refresh()
    } finally { setRevokingGenericId(null) }
  }

  const deptName = (id: string) => departments.find(d => d.id === id)?.name ?? id
  const hostelName = (id: string) => initialHostels.find(h => h.id === id)?.name ?? id

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Leadership & Appointments">
      {error && <div className={styles.errorBanner}>{error}</div>}

      {/* ── Vice Principals ── */}
      <div className={styles.sectionHeader}>
        <p className={styles.sectionLabel}>Vice Principals</p>
        <button className={`${styles.newBtn} ${motion.rippleHost}`} onClick={openVpPicker} onMouseDown={ripple(motion)}>
          <PlusIcon size={13} /> Appoint
        </button>
      </div>

      {vicePrincipals.length === 0 ? (
        <div className={styles.emptyState}><p>No Vice Principal appointed yet. Appointing one gives them their own dashboard with school-wide operational visibility and HOD authority over whichever departments you assign them.</p></div>
      ) : (
        <div className={styles.vpGrid}>
          {vicePrincipals.map(vp => (
            <div key={vp.appointmentId} className={`${styles.vpCard} glass-card`}>
              <div className={styles.vpAvatar}>{vp.avatarUrl ? <img src={vp.avatarUrl} alt="" /> : <CrownIcon size={16} />}</div>
              <div className={styles.vpInfo}>
                <p className={styles.vpName}>{vp.fullName}</p>
                <p className={styles.vpMeta}>
                  {vp.portfolio ? PORTFOLIOS.find(p => p.value === vp.portfolio)?.label ?? vp.portfolio : 'No portfolio set'}
                  {vp.departmentIds.length > 0 ? ` · ${vp.departmentIds.map(deptName).join(', ')}` : ' · No departments assigned'}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className={styles.editBtn} onClick={() => openEditVp(vp)} disabled={revokingVpId === vp.appointmentId}>Edit</button>
                <button className={styles.revokeBtn} onClick={() => revokeVp(vp)} disabled={revokingVpId === vp.appointmentId}>
                  {revokingVpId === vp.appointmentId ? 'Removing…' : 'Revoke'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Hostel Prefects ── */}
      <div className={styles.sectionHeader} style={{ marginTop: 'var(--space-6)' }}>
        <p className={styles.sectionLabel}>Hostel Prefects</p>
        <button className={`${styles.newBtn} ${motion.rippleHost}`} onClick={openHpPicker} onMouseDown={ripple(motion)}>
          <PlusIcon size={13} /> Appoint
        </button>
      </div>

      {hostelPrefects.length === 0 ? (
        <div className={styles.emptyState}><p>No Hostel Prefect appointed yet. Appointing one lets a student assist with roll call in their assigned hostel only - they never see incidents, leave requests, or maintenance, which stay staff-only.</p></div>
      ) : (
        <div className={styles.vpGrid}>
          {hostelPrefects.map(hp => (
            <div key={hp.appointmentId} className={`${styles.vpCard} glass-card`}>
              <div className={styles.vpAvatar}>{hp.avatarUrl ? <img src={hp.avatarUrl} alt="" /> : <HomeIcon size={16} />}</div>
              <div className={styles.vpInfo}>
                <p className={styles.vpName}>{hp.fullName}</p>
                <p className={styles.vpMeta}>{hp.hostelIds.map(hostelName).join(', ')}</p>
              </div>
              <button className={styles.revokeBtn} onClick={() => revokeHp(hp)} disabled={revokingHpId === hp.appointmentId}>
                {revokingHpId === hp.appointmentId ? 'Removing…' : 'Revoke'}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* ── Departments ── */}
      <div className={styles.sectionHeader} style={{ marginTop: 'var(--space-6)' }}>
        <p className={styles.sectionLabel}>Departments</p>
        <button className={`${styles.newBtn} ${motion.rippleHost}`} onClick={() => { setShowCreate(true); setError('') }} onMouseDown={ripple(motion)}>
          <PlusIcon size={13} /> New department
        </button>
      </div>

      {departments.length === 0 ? (
        <div className={styles.emptyState}><p>No departments created yet. Start with the ones your school already organizes staff by - e.g. Sciences, Languages, or Sports.</p></div>
      ) : (
        <div className={styles.deptGrid}>
          {departments.map(d => (
            <DepartmentCard key={d.id} department={d}
              onEdit={() => openEdit(d)} onDelete={() => handleDelete(d)} onOpenMembers={() => openMembers(d)}
              onAssignHod={() => openHodPicker(d)} onRevokeHod={d.hod ? () => revokeHod(d) : undefined}
              revokingHod={revokingHodDeptId === d.id}
            />
          ))}
        </div>
      )}

      {/* ── Generic appointment types, grouped by category ── */}
      {CATEGORY_ORDER.map(category => {
        const typesInCategory = GENERIC_TYPES.filter(t => APPOINTMENT_TYPES[t].category === category)
        if (typesInCategory.length === 0) return null
        return (
          <div key={category}>
            <p className={styles.categoryTitle} style={{ marginTop: 'var(--space-6)' }}>{CATEGORY_LABELS[category]}</p>
            {typesInCategory.map(type => {
              const holders = genericAppointments[type] ?? []
              return (
                <div key={type} className={styles.genericTypeRow}>
                  <div className={styles.genericTypeHeader}>
                    <p className={styles.genericTypeLabel}>{APPOINTMENT_TYPES[type].label}</p>
                    <button className={`${styles.newBtn} ${motion.rippleHost}`} onClick={() => openGenericPicker(type)} onMouseDown={ripple(motion)}>
                      <PlusIcon size={12} /> Appoint
                    </button>
                  </div>
                  {holders.length === 0 ? (
                    <p className={styles.hint}>No one appointed yet.</p>
                  ) : (
                    <div className={styles.genericHolderList}>
                      {holders.map(h => (
                        <div key={h.appointmentId} className={styles.genericHolderChip}>
                          <div className={styles.memberAvatar}>{h.avatarUrl ? <img src={h.avatarUrl} alt="" /> : <UserIcon size={12} />}</div>
                          <span>
                            {h.fullName}
                            {HOSTEL_SCOPED_TYPES.has(type) && h.hostelIds.length > 0 && ` · ${h.hostelIds.map(hostelName).join(', ')}`}
                            {CLASS_SCOPED_TYPES.has(type) && h.classIds.length > 0 && ` · ${h.classIds.map(id => initialClasses.find(c => c.id === id)?.name ?? id).join(', ')}`}
                          </span>
                          <button
                            className={styles.chipRevokeBtn}
                            onClick={() => revokeGeneric(type, h.appointmentId, h.fullName)}
                            disabled={revokingGenericId === h.appointmentId}
                            aria-label={`Revoke ${h.fullName}`}
                          >
                            <XIcon size={11} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {/* ── Modals ── */}
      {showCreate && (
        <div className={styles.overlay} onClick={() => setShowCreate(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}><p className={styles.modalTitle}>New department</p><button className={styles.closeBtn} onClick={() => setShowCreate(false)}><XIcon size={16} /></button></div>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Sciences" autoFocus />
            <label className={styles.label}>Description (optional)</label>
            <textarea className={styles.textarea} value={newDesc} onChange={e => setNewDesc(e.target.value)} rows={3} />
            <button className={styles.primaryBtn} onClick={handleCreate} disabled={creating || !newName.trim()}>{creating ? 'Creating…' : 'Create department'}</button>
          </div>
        </div>
      )}

      {editing && (
        <div className={styles.overlay} onClick={() => setEditing(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}><p className={styles.modalTitle}>Edit department</p><button className={styles.closeBtn} onClick={() => setEditing(null)}><XIcon size={16} /></button></div>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={editName} onChange={e => setEditName(e.target.value)} />
            <label className={styles.label}>Description</label>
            <textarea className={styles.textarea} value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} />
            <button className={styles.primaryBtn} onClick={handleSaveEdit} disabled={saving || !editName.trim()}>{saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
      )}

      {membersPanel && (
        <div className={styles.overlay} onClick={() => setMembersPanel(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}><p className={styles.modalTitle}>{membersPanel.name} - members</p><button className={styles.closeBtn} onClick={() => setMembersPanel(null)}><XIcon size={16} /></button></div>
            {loadingMembers ? <p className={styles.hint}>Loading…</p> : members.length === 0 ? <p className={styles.hint}>No teachers assigned yet. Add members from the Staff page.</p> : (
              <div className={styles.memberList}>
                {members.map(m => (
                  <div key={m.id} className={styles.memberRow}>
                    <div className={styles.memberAvatar}>{m.avatar_url ? <img src={m.avatar_url} alt="" /> : <UserIcon size={14} />}</div>
                    <div className={styles.memberInfo}><p className={styles.memberName}>{m.full_name}</p><p className={styles.memberMeta}>{m.employee_id ?? m.email}</p></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {hodPicker && (
        <div className={styles.overlay} onClick={() => setHodPicker(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}><p className={styles.modalTitle}>Assign Head of {hodPicker.name}</p><button className={styles.closeBtn} onClick={() => setHodPicker(null)}><XIcon size={16} /></button></div>
            {loadingEligible ? <p className={styles.hint}>Loading…</p> : (
              <div className={styles.memberList}>
                {eligibleHods.map(s => (
                  <button key={s.id} className={styles.pickRow} onClick={() => assignHod(s.id)} disabled={!!assigningHodId}>
                    <div className={styles.memberAvatar}>{s.avatar_url ? <img src={s.avatar_url} alt="" /> : <UserIcon size={14} />}</div>
                    <p className={styles.memberName}>{assigningHodId === s.id ? 'Assigning…' : s.full_name}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {showVpPicker && (
        <div className={styles.overlay} onClick={closeVpModal}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>
                {editingVpAppointmentId ? `Edit - ${selectedVpCandidate?.full_name}` : vpStep === 'pick' ? 'Appoint Vice Principal' : `Configure - ${selectedVpCandidate?.full_name}`}
              </p>
              <button className={styles.closeBtn} onClick={closeVpModal}><XIcon size={16} /></button>
            </div>

            {vpStep === 'pick' ? (
              loadingVpEligible ? <p className={styles.hint}>Loading…</p> : eligibleVps.length === 0 ? <p className={styles.hint}>No eligible staff found - Vice Principal can be appointed from your teaching staff.</p> : (
                <div className={styles.memberList}>
                  {eligibleVps.map(s => (
                    <button key={s.id} className={styles.pickRow} onClick={() => pickVpCandidate(s)}>
                      <div className={styles.memberAvatar}>{s.avatar_url ? <img src={s.avatar_url} alt="" /> : <UserIcon size={14} />}</div>
                      <p className={styles.memberName}>{s.full_name}</p>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <>
                <label className={styles.label}>Portfolio</label>
                <select className={styles.input} value={vpPortfolio} onChange={e => setVpPortfolio(e.target.value)}>
                  {PORTFOLIOS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                </select>
                <label className={styles.label}>Departments this Vice Principal oversees</label>
                <p className={styles.hint} style={{ marginBottom: 8 }}>Controls which departments they can approve, publish for, or assign a Head of Department to. Leave empty to configure later - they'll still get full view access.</p>
                {departments.length === 0 ? <p className={styles.hint}>No departments created yet.</p> : (
                  <div className={styles.checkList}>
                    {departments.map(d => (
                      <label key={d.id} className={styles.checkRow}>
                        <input type="checkbox" checked={vpDeptIds.includes(d.id)} onChange={() => toggleVpDept(d.id)} />
                        {d.name}
                      </label>
                    ))}
                  </div>
                )}
                <button className={styles.primaryBtn} onClick={confirmAppointVp} disabled={appointing}>
                  {appointing ? (editingVpAppointmentId ? 'Saving…' : 'Appointing…') : editingVpAppointmentId ? 'Save changes' : 'Confirm appointment'}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {showHpPicker && (
        <div className={styles.overlay} onClick={() => setShowHpPicker(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>{hpStep === 'pick' ? 'Appoint Hostel Prefect' : `Configure - ${selectedHpCandidate?.full_name}`}</p>
              <button className={styles.closeBtn} onClick={() => setShowHpPicker(false)}><XIcon size={16} /></button>
            </div>

            {hpStep === 'pick' ? (
              loadingHpEligible ? <p className={styles.hint}>Loading…</p> : eligibleHp.length === 0 ? <p className={styles.hint}>No eligible students found, or every student is already a Hostel Prefect.</p> : (
                <div className={styles.memberList}>
                  {eligibleHp.map(s => (
                    <button key={s.id} className={styles.pickRow} onClick={() => pickHpCandidate(s)}>
                      <div className={styles.memberAvatar}>{s.avatar_url ? <img src={s.avatar_url} alt="" /> : <UserIcon size={14} />}</div>
                      <p className={styles.memberName}>{s.full_name}</p>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <>
                <label className={styles.label}>Hostel(s) this prefect assists with</label>
                <p className={styles.hint} style={{ marginBottom: 8 }}>Controls which hostel's roll call they can record attendance for. They get no other access - incidents, leave, and maintenance always stay staff-only regardless of what's selected here.</p>
                {initialHostels.length === 0 ? <p className={styles.hint}>No hostels exist yet.</p> : (
                  <div className={styles.checkList}>
                    {initialHostels.map(h => (
                      <label key={h.id} className={styles.checkRow}>
                        <input type="checkbox" checked={hpHostelIds.includes(h.id)} onChange={() => toggleHpHostel(h.id)} />
                        {h.name}
                      </label>
                    ))}
                  </div>
                )}
                <button className={styles.primaryBtn} onClick={confirmAppointHp} disabled={appointingHp || hpHostelIds.length === 0}>{appointingHp ? 'Appointing…' : 'Confirm appointment'}</button>
              </>
            )}
          </div>
        </div>
      )}

      {genericPicker && (
        <div className={styles.overlay} onClick={closeGenericPicker}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>
                {genericPicker.step === 'pick' ? `Appoint ${APPOINTMENT_TYPES[genericPicker.type].label}` : `Configure - ${selectedGenericCandidate?.full_name}`}
              </p>
              <button className={styles.closeBtn} onClick={closeGenericPicker}><XIcon size={16} /></button>
            </div>

            {genericPicker.step === 'pick' ? (
              loadingGenericCandidates ? <p className={styles.hint}>Loading…</p> : genericCandidates.length === 0 ? (
                <p className={styles.hint}>
                  No eligible {APPOINTMENT_TYPES[genericPicker.type].baseRoleScope.includes('student') ? 'students' : 'staff'} found.
                </p>
              ) : (
                <div className={styles.memberList}>
                  {genericCandidates.map(s => (
                    <button key={s.id} className={styles.pickRow} onClick={() => pickGenericCandidate(s)} disabled={appointingGeneric}>
                      <div className={styles.memberAvatar}>{s.avatar_url ? <img src={s.avatar_url} alt="" /> : <UserIcon size={14} />}</div>
                      <p className={styles.memberName}>{assigningGenericCandidateId === s.id ? 'Assigning…' : s.full_name}</p>
                    </button>
                  ))}
                </div>
              )
            ) : (
              <>
                <label className={styles.label}>
                  {HOSTEL_SCOPED_TYPES.has(genericPicker.type) ? 'Hostel(s)' : 'Class'}
                </label>
                {HOSTEL_SCOPED_TYPES.has(genericPicker.type) ? (
                  initialHostels.length === 0 ? <p className={styles.hint}>No hostels exist yet.</p> : (
                    <div className={styles.checkList}>
                      {initialHostels.map(h => (
                        <label key={h.id} className={styles.checkRow}>
                          <input type="checkbox" checked={genericScopeIds.includes(h.id)} onChange={() => toggleGenericScope(h.id)} />
                          {h.name}
                        </label>
                      ))}
                    </div>
                  )
                ) : (
                  initialClasses.length === 0 ? <p className={styles.hint}>No classes exist yet.</p> : (
                    <div className={styles.checkList}>
                      {initialClasses.map(c => (
                        <label key={c.id} className={styles.checkRow}>
                          <input type="checkbox" checked={genericScopeIds.includes(c.id)} onChange={() => toggleGenericScope(c.id)} />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  )
                )}
                <button className={styles.primaryBtn} onClick={confirmGenericConfigure} disabled={appointingGeneric || genericScopeIds.length === 0}>
                  {appointingGeneric ? 'Appointing…' : 'Confirm appointment'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </RolePageWrapper>
  )
}
