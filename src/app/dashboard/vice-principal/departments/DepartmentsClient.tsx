'use client'
// src/app/dashboard/vice-principal/departments/DepartmentsClient.tsx

import { useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import DepartmentCard from '@/components/org/DepartmentCard'
import { PlusIcon, XIcon, UserIcon } from '@/components/Icons'
import { ripple } from '@/lib/ripple'
import motion from '@/components/dashboard-motion.module.css'
import { VP_FEATURE_GROUPS } from '../featureGroups'
import type { DepartmentWithStats } from '@/lib/supabase/appointments'
import styles from './departments.module.css'

interface StaffOption { id: string; full_name: string; avatar_url: string | null; department_id: string | null; employee_id: string | null }
interface Member { id: string; full_name: string; email: string; avatar_url: string | null; subjects_taught: string[] | null; employee_id: string | null }

interface Props {
  profile: any; school: any; userId: string
  initialDepartments: DepartmentWithStats[]
  scopedDepartmentIds: string[]
}

export default function DepartmentsClient({ profile, school, userId, initialDepartments, scopedDepartmentIds }: Props) {
  const [departments, setDepartments] = useState(initialDepartments)
  const [error, setError] = useState('')

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [creating, setCreating] = useState(false)

  const [editing, setEditing] = useState<DepartmentWithStats | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const [membersPanel, setMembersPanel] = useState<DepartmentWithStats | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  const [hodPicker, setHodPicker] = useState<DepartmentWithStats | null>(null)
  const [eligibleHods, setEligibleHods] = useState<StaffOption[]>([])
  const [loadingEligible, setLoadingEligible] = useState(false)
  const [assigning, setAssigning] = useState(false)

  const scopedSet = new Set(scopedDepartmentIds)

  async function refreshDepartments() {
    const res = await fetch('/api/org/departments')
    const json = await res.json()
    if (json.ok) setDepartments(json.departments)
  }

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true); setError('')
    try {
      const res = await fetch('/api/org/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, description: newDesc || undefined }),
      })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not create department.'); return }
      setNewName(''); setNewDesc(''); setShowCreate(false)
      await refreshDepartments()
    } finally {
      setCreating(false)
    }
  }

  function openEdit(d: DepartmentWithStats) {
    setEditing(d); setEditName(d.name); setEditDesc(d.description ?? ''); setError('')
  }

  async function handleSaveEdit() {
    if (!editing) return
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/org/departments/${editing.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName, description: editDesc || null }),
      })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not save changes.'); return }
      setEditing(null)
      await refreshDepartments()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(d: DepartmentWithStats) {
    if (!confirm(`Delete "${d.name}"? Members will be unassigned and any Head of Department appointment for it will be revoked. This can't be undone.`)) return
    const res = await fetch(`/api/org/departments/${d.id}`, { method: 'DELETE' })
    const json = await res.json()
    if (!json.ok) { setError(json.error ?? 'Could not delete department.'); return }
    await refreshDepartments()
  }

  async function openMembers(d: DepartmentWithStats) {
    setMembersPanel(d); setLoadingMembers(true); setError('')
    try {
      const res = await fetch(`/api/org/departments/${d.id}`)
      const json = await res.json()
      if (json.ok) setMembers(json.members)
    } finally {
      setLoadingMembers(false)
    }
  }

  async function removeMember(memberId: string) {
    if (!membersPanel) return
    const res = await fetch('/api/org/assign-department', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teacherId: memberId, departmentId: null }),
    })
    const json = await res.json()
    if (!json.ok) { setError(json.error ?? 'Could not remove member.'); return }
    setMembers(m => m.filter(x => x.id !== memberId))
    await refreshDepartments()
  }

  async function openHodPicker(d: DepartmentWithStats) {
    setHodPicker(d); setLoadingEligible(true); setError('')
    try {
      const res = await fetch('/api/org/eligible-staff?appointmentType=hod')
      const json = await res.json()
      if (json.ok) setEligibleHods(json.staff)
    } finally {
      setLoadingEligible(false)
    }
  }

  async function assignHod(staffId: string) {
    if (!hodPicker) return
    setAssigning(true); setError('')
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: staffId, appointmentType: 'hod', departmentId: hodPicker.id }),
      })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not assign Head of Department.'); return }
      setHodPicker(null)
      await refreshDepartments()
    } finally {
      setAssigning(false)
    }
  }

  async function revokeHod(d: DepartmentWithStats) {
    if (!d.hod || !confirm(`Remove ${d.hod.full_name} as Head of Department of ${d.name}?`)) return
    const res = await fetch('/api/appointments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appointmentId: d.hod.appointment_id }),
    })
    const json = await res.json()
    if (!json.ok) { setError(json.error ?? 'Could not revoke appointment.'); return }
    await refreshDepartments()
  }

  const inScope = (d: DepartmentWithStats) => scopedSet.has(d.id)

  return (
    <RoleSubHeader
      userId={userId} role="vice-principal" profile={profile} school={school}
      title="Departments" featureGroups={VP_FEATURE_GROUPS}
    >
      <div className={styles.topRow}>
        <p className={styles.hint}>
          You can view and edit every department. Assigning or changing a
          Head of Department is limited to the departments your Principal
          has assigned to you.
        </p>
        <button
          className={`${styles.newBtn} ${motion.rippleHost} ${motion.focusable}`}
          onClick={() => { setShowCreate(true); setError('') }}
          onMouseDown={ripple(motion)}
        >
          <PlusIcon size={14} /> New department
        </button>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {departments.length === 0 ? (
        <div className={styles.emptyState}>
          <p>No departments have been created yet. Start with the ones your school already organizes staff by - e.g. Sciences, Languages, or Sports.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {departments.map(d => (
            <div key={d.id} style={!inScope(d) ? { opacity: 0.82 } : undefined}>
              <DepartmentCard
                department={d}
                detailHref={`/dashboard/vice-principal/departments/${d.id}`}
                onEdit={() => openEdit(d)}
                onDelete={() => handleDelete(d)}
                onOpenMembers={() => openMembers(d)}
                onAssignHod={inScope(d) ? () => openHodPicker(d) : undefined}
                onRevokeHod={inScope(d) ? () => revokeHod(d) : undefined}
              />
              {!inScope(d) && <p className={styles.outOfScope}>Outside your assigned scope - view only</p>}
            </div>
          ))}
        </div>
      )}

      {/* Create department */}
      {showCreate && (
        <div className={styles.overlay} onClick={() => setShowCreate(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>New department</p>
              <button className={styles.closeBtn} onClick={() => setShowCreate(false)} aria-label="Close"><XIcon size={16} /></button>
            </div>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Sciences" autoFocus />
            <label className={styles.label}>Description (optional)</label>
            <textarea className={styles.textarea} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="What this department covers" rows={3} />
            <button className={styles.primaryBtn} onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? 'Creating…' : 'Create department'}
            </button>
          </div>
        </div>
      )}

      {/* Edit department */}
      {editing && (
        <div className={styles.overlay} onClick={() => setEditing(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>Edit department</p>
              <button className={styles.closeBtn} onClick={() => setEditing(null)} aria-label="Close"><XIcon size={16} /></button>
            </div>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={editName} onChange={e => setEditName(e.target.value)} />
            <label className={styles.label}>Description</label>
            <textarea className={styles.textarea} value={editDesc} onChange={e => setEditDesc(e.target.value)} rows={3} />
            <button className={styles.primaryBtn} onClick={handleSaveEdit} disabled={saving || !editName.trim()}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}

      {/* Members panel */}
      {membersPanel && (
        <div className={styles.overlay} onClick={() => setMembersPanel(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>{membersPanel.name} - members</p>
              <button className={styles.closeBtn} onClick={() => setMembersPanel(null)} aria-label="Close"><XIcon size={16} /></button>
            </div>
            {loadingMembers ? (
              <p className={styles.hint}>Loading…</p>
            ) : members.length === 0 ? (
              <p className={styles.hint}>No teachers are assigned to this department yet. Add members from the Staff page.</p>
            ) : (
              <div className={styles.memberList}>
                {members.map(m => (
                  <div key={m.id} className={styles.memberRow}>
                    <div className={styles.memberAvatar}>
                      {m.avatar_url ? <img src={m.avatar_url} alt="" /> : <UserIcon size={14} />}
                    </div>
                    <div className={styles.memberInfo}>
                      <p className={styles.memberName}>{m.full_name}</p>
                      <p className={styles.memberMeta}>{m.employee_id ?? m.email}</p>
                    </div>
                    <button className={styles.removeBtn} onClick={() => removeMember(m.id)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Assign HOD picker */}
      {hodPicker && (
        <div className={styles.overlay} onClick={() => setHodPicker(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>Assign Head of {hodPicker.name}</p>
              <button className={styles.closeBtn} onClick={() => setHodPicker(null)} aria-label="Close"><XIcon size={16} /></button>
            </div>
            {loadingEligible ? (
              <p className={styles.hint}>Loading eligible teachers…</p>
            ) : eligibleHods.length === 0 ? (
              <p className={styles.hint}>No teachers found at this school yet.</p>
            ) : (
              <div className={styles.memberList}>
                {eligibleHods
                  .slice()
                  .sort((a, b) => Number(b.department_id === hodPicker.id) - Number(a.department_id === hodPicker.id))
                  .map(s => (
                  <button key={s.id} className={styles.pickRow} onClick={() => assignHod(s.id)} disabled={assigning}>
                    <div className={styles.memberAvatar}>
                      {s.avatar_url ? <img src={s.avatar_url} alt="" /> : <UserIcon size={14} />}
                    </div>
                    <div className={styles.memberInfo}>
                      <p className={styles.memberName}>{s.full_name}</p>
                      {s.department_id === hodPicker.id && <p className={styles.memberMeta}>Already in this department</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </RoleSubHeader>
  )
}
