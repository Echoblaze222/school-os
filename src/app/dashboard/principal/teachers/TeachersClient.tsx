'use client'
// src/app/dashboard/principal/teachers/TeachersClient.tsx
// FIX: replaced custom hardcoded bottom-nav with RolePageWrapper so the nav
// pill matches every other principal sub-page (Staff, Stats, Home, Chat, AI).

import { useEffect, useState, useMemo } from 'react'
import { useRouter }                    from 'next/navigation'
import RolePageWrapper                  from '@/components/RolePageWrapper'
import type { TeacherRow }              from './page'
import styles                           from './teachers.module.css'

interface Props {
  teachers: TeacherRow[]
  // RolePageWrapper props — page.tsx must forward these
  profile?: any
  school?:  any
  userId?:  string
}

function initials(n: string) {
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
function relTime(iso: string | null) {
  if (!iso) return 'Never'
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function getRoleLabel(teacher: TeacherRow): { label: string; color: string; bg: string } {
  const hasPrimary = teacher.class_assignments.some(a => a.is_primary)
  const hasSubject = teacher.class_assignments.some(a => !a.is_primary || a.subject)
  if (hasPrimary && hasSubject) return { label: 'Class + Subject', color: '#F59E0B', bg: '#F59E0B20' }
  if (hasPrimary)               return { label: 'Class Teacher',   color: '#F59E0B', bg: '#F59E0B20' }
  if (hasSubject)               return { label: 'Subject Teacher', color: '#3B82F6', bg: '#3B82F620' }
  return                               { label: 'Unassigned',      color: '#6B7280', bg: '#6B728020' }
}

export default function TeachersClient({ teachers, profile, school, userId }: Props) {
  const router = useRouter()

  const [search,     setSearch]     = useState('')
  const [selected,   setSelected]   = useState<TeacherRow | null>(null)
  const [roleFilter, setRoleFilter] = useState<'all' | 'class' | 'subject' | 'unassigned'>('all')

  useEffect(() => {
    const theme = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  const filtered = useMemo(() => {
    return teachers.filter(t => {
      const matchSearch =
        !search ||
        t.full_name.toLowerCase().includes(search.toLowerCase()) ||
        t.email.toLowerCase().includes(search.toLowerCase())

      const hasPrimary = t.class_assignments.some(a => a.is_primary)
      const hasSubject = t.class_assignments.some(a => !a.is_primary || a.subject)

      const matchRole =
        roleFilter === 'all'        ? true :
        roleFilter === 'class'      ? hasPrimary :
        roleFilter === 'subject'    ? (!hasPrimary && hasSubject) :
        /* unassigned */              t.class_assignments.length === 0

      return matchSearch && matchRole
    })
  }, [teachers, search, roleFilter])

  const classTeacherCount   = teachers.filter(t => t.class_assignments.some(a => a.is_primary)).length
  const subjectTeacherCount = teachers.filter(t => !t.class_assignments.some(a => a.is_primary) && t.class_assignments.length > 0).length
  const unassignedCount     = teachers.filter(t => t.class_assignments.length === 0).length

  const sc = school?.primary_color ?? '#7C3AED'

  const pills: { key: typeof roleFilter; label: string; count: number }[] = [
    { key: 'all',        label: 'All',              count: teachers.length        },
    { key: 'class',      label: 'Class Teachers',   count: classTeacherCount      },
    { key: 'subject',    label: 'Subject Teachers', count: subjectTeacherCount    },
    { key: 'unassigned', label: 'Unassigned',       count: unassignedCount        },
  ]

  return (
    <RolePageWrapper
      userId={userId ?? ''}
      role="principal"
      profile={profile ?? null}
      school={school  ?? null}
      title="All Teachers"
      showBack={false}
    >
      {/* Decorative orb */}
      <div className={styles.bgOrb} aria-hidden/>

      {/* ── Subtitle ── */}
      <p style={{
        fontFamily: 'var(--font-body)', fontSize: '0.72rem',
        color: 'var(--text-muted)', padding: '0 var(--space-5)',
        marginBottom: 'var(--space-2)',
      }}>
        {teachers.length} staff member{teachers.length !== 1 ? 's' : ''}
      </p>

      {/* ── Role filter pills ── */}
      <div className={styles.filterBar}>
        {pills.map(p => (
          <button
            key={p.key}
            className={`${styles.pill} ${roleFilter === p.key ? styles.pillActive : ''}`}
            style={roleFilter === p.key
              ? { background: sc, color: '#fff', borderColor: sc }
              : {}}
            onClick={() => setRoleFilter(p.key)}
          >
            {p.label} ({p.count})
          </button>
        ))}
      </div>

      {/* ── Search ── */}
      <div className={styles.searchRow}>
        <div style={{
          flex: 1, position: 'relative',
          display: 'flex', alignItems: 'center',
        }}>
          <svg
            style={{ position: 'absolute', left: 12, color: 'var(--text-muted)', pointerEvents: 'none' }}
            width="15" height="15" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            className={styles.searchInput}
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <span className={styles.countLabel}>
          {filtered.length} of {teachers.length} teachers
        </span>
      </div>

      {/* ── Teacher list ── */}
      <main className={styles.main}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 00-3-3.87"/>
                <path d="M16 3.13a4 4 0 010 7.75"/>
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>No teachers found</h3>
            <p className={styles.emptyBody}>Try adjusting your search or filter.</p>
          </div>
        ) : (
          <div className={styles.teacherList}>
            {filtered.map((t, i) => {
              const role = getRoleLabel(t)
              return (
                <button
                  key={t.id}
                  className={`glass-card ${styles.teacherCard} animate-fade-up`}
                  style={{ animationDelay: `${Math.min(i, 20) * 40}ms`, opacity: 0 }}
                  onClick={() => setSelected(t)}
                >
                  {/* Avatar */}
                  <div className={styles.avatar}>{initials(t.full_name)}</div>

                  {/* Info */}
                  <div className={styles.cardInfo}>
                    <div className={styles.cardTop}>
                      <p className={styles.cardName}>{t.full_name}</p>
                      <span
                        className={styles.roleBadge}
                        style={{ background: role.bg, color: role.color }}
                      >
                        {role.label}
                      </span>
                    </div>
                    <p className={styles.cardEmail}>{t.email}</p>
                    <div className={styles.cardMeta}>
                      <span className={styles.metaItem}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round">
                          <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                          <path d="M6 12v5c3 3 9 3 12 0v-5"/>
                        </svg>
                        {t.classes.length === 0
                          ? 'No classes'
                          : t.classes.slice(0, 2).join(', ') + (t.classes.length > 2 ? ` +${t.classes.length - 2}` : '')}
                      </span>
                      <span className={styles.metaItem}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
                          stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="12" cy="12" r="10"/>
                          <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        {relTime(t.last_activity)}
                      </span>
                    </div>
                  </div>

                  {/* Status chip */}
                  <span className={`${styles.statusBadge} ${t.is_active ? styles.statusActive : styles.statusInactive}`}>
                    {t.is_active ? 'Active' : 'Inactive'}
                  </span>

                  {/* Chevron */}
                  <svg
                    className={styles.chevron} width="14" height="14"
                    viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <polyline points="9 18 15 12 9 6"/>
                  </svg>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Detail drawer ── */}
      {selected && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setSelected(null)}/>
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerAvatar}>{initials(selected.full_name)}</div>
              <div className={styles.drawerMeta}>
                <p className={styles.drawerName}>{selected.full_name}</p>
                <p className={styles.drawerEmail}>{selected.email}</p>
              </div>
              <button
                className={styles.drawerClose}
                onClick={() => setSelected(null)}
                aria-label="Close"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <div className={styles.drawerBody}>
              {/* Role badge */}
              {(() => {
                const r = getRoleLabel(selected)
                return (
                  <span className={styles.drawerRoleBadge} style={{ background: r.bg, color: r.color }}>
                    {r.label}
                  </span>
                )
              })()}

              {/* Personal Info */}
              <section className={styles.drawerSection}>
                <p className={styles.drawerSectionTitle}>Personal Info</p>
                {[
                  { label: 'Phone',         value: selected.phone          ?? '—' },
                  { label: 'Employee ID',   value: selected.employee_id    ?? '—' },
                  { label: 'Qualification', value: selected.qualification  ?? '—' },
                  { label: 'Status',        value: selected.is_active ? 'Active' : 'Inactive' },
                ].map(row => (
                  <div key={row.label} className={styles.drawerField}>
                    <span className={styles.drawerFieldLabel}>{row.label}</span>
                    <span className={styles.drawerFieldValue}>{row.value}</span>
                  </div>
                ))}
              </section>

              {/* Class Assignments */}
              <section className={styles.drawerSection}>
                <p className={styles.drawerSectionTitle}>
                  Class Assignments ({selected.class_assignments.length})
                </p>
                {selected.class_assignments.length === 0 ? (
                  <p className={styles.emptyHint}>No classes assigned yet.</p>
                ) : (
                  <div className={styles.assignmentList}>
                    {selected.class_assignments.map((a, i) => (
                      <div key={i} className={styles.assignmentItem}>
                        <div>
                          <p className={styles.assignmentClass}>{a.class_name}</p>
                          <p className={styles.assignmentSubject}>{a.subject ?? 'All Subjects'}</p>
                        </div>
                        <span
                          className={styles.assignmentRole}
                          style={{
                            background: a.is_primary ? '#F59E0B20' : '#3B82F620',
                            color:      a.is_primary ? '#F59E0B'   : '#3B82F6',
                          }}
                        >
                          {a.is_primary ? '👑 Class' : 'Subject'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              {/* Activity */}
              <section className={styles.drawerSection}>
                <p className={styles.drawerSectionTitle}>Activity</p>
                {[
                  { label: 'Last Active',    value: relTime(selected.last_activity) },
                  { label: 'Last Action',    value: selected.last_action       ?? '—' },
                  { label: 'Notes Uploaded', value: String(selected.notes_uploaded)  },
                  { label: 'Results Posted', value: String(selected.results_posted)  },
                ].map(row => (
                  <div key={row.label} className={styles.drawerField}>
                    <span className={styles.drawerFieldLabel}>{row.label}</span>
                    <span className={styles.drawerFieldValue}>{row.value}</span>
                  </div>
                ))}
              </section>
            </div>
          </aside>
        </>
      )}
    </RolePageWrapper>
  )
          }
                      
