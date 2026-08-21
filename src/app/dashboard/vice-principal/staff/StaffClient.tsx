'use client'
// src/app/dashboard/vice-principal/staff/StaffClient.tsx

import { useState, useMemo } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import { SearchIcon, UserIcon } from '@/components/Icons'
import { VP_FEATURE_GROUPS } from '../featureGroups'
import type { DepartmentWithStats } from '@/lib/supabase/appointments'
import styles from './staff.module.css'

interface Teacher {
  id: string; full_name: string; email: string; avatar_url: string | null
  employee_id: string | null; subjects_taught: string[] | null
  department_id: string | null; last_activity: string | null
}

interface Props {
  profile: any; school: any; userId: string
  initialTeachers: Teacher[]
  departments: DepartmentWithStats[]
}

export default function StaffClient({ profile, school, userId, initialTeachers, departments }: Props) {
  const [teachers, setTeachers] = useState(initialTeachers)
  const [query, setQuery] = useState('')
  const [filterDept, setFilterDept] = useState('all')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState('')

  const deptById = useMemo(() => new Map(departments.map(d => [d.id, d.name])), [departments])

  const visible = teachers.filter(t => {
    if (filterDept === 'unassigned' && t.department_id) return false
    if (filterDept !== 'all' && filterDept !== 'unassigned' && t.department_id !== filterDept) return false
    if (query && !t.full_name.toLowerCase().includes(query.toLowerCase())) return false
    return true
  })

  async function handleReassign(teacherId: string, departmentId: string) {
    setSavingId(teacherId); setError('')
    try {
      const res = await fetch('/api/org/assign-department', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teacherId, departmentId: departmentId || null }),
      })
      const json = await res.json()
      if (!json.ok) { setError(json.error ?? 'Could not update department assignment.'); return }
      setTeachers(prev => prev.map(t => t.id === teacherId ? { ...t, department_id: departmentId || null } : t))
    } finally {
      setSavingId(null)
    }
  }

  return (
    <RoleSubHeader
      userId={userId} role="vice-principal" profile={profile} school={school}
      title="Staff" featureGroups={VP_FEATURE_GROUPS}
    >
      <div className={styles.filterRow}>
        <div className={styles.searchBox}>
          <SearchIcon size={14} />
          <input placeholder="Search teachers…" value={query} onChange={e => setQuery(e.target.value)} />
        </div>
        <select className={styles.select} value={filterDept} onChange={e => setFilterDept(e.target.value)}>
          <option value="all">All departments</option>
          <option value="unassigned">Unassigned</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {error && <div className={styles.errorBanner}>{error}</div>}

      {visible.length === 0 ? (
        <div className={styles.emptyState}><p>No teachers match this filter.</p></div>
      ) : (
        <div className={styles.list}>
          {visible.map(t => (
            <div key={t.id} className={`${styles.row} glass-card`}>
              <div className={styles.avatar}>
                {t.avatar_url ? <img src={t.avatar_url} alt="" /> : <UserIcon size={16} />}
              </div>
              <div className={styles.info}>
                <p className={styles.name}>{t.full_name}</p>
                <p className={styles.meta}>
                  {t.employee_id ?? t.email}
                  {t.subjects_taught && t.subjects_taught.length > 0 && ` · ${t.subjects_taught.slice(0, 3).join(', ')}`}
                </p>
              </div>
              <select
                className={styles.deptSelect}
                value={t.department_id ?? ''}
                disabled={savingId === t.id}
                onChange={e => handleReassign(t.id, e.target.value)}
              >
                <option value="">No department</option>
                {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 40 }} />
    </RoleSubHeader>
  )
}
