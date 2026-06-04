'use client'
// src/app/dashboard/principal/teachers/TeachersClient.tsx
// FIX: Shows Class Teacher vs Subject Teacher roles per class in the detail drawer
// FIX: Adds employee_id and qualification to drawer
// FIX: Table shows role type badge instead of just subjects/classes text

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import type { TeacherRow } from './page'
import styles from '../principal-dashboard.module.css'

interface Props { teachers: TeacherRow[] }

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

const IconSun  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconX    = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconLeft = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M15 18l-6-6 6-6"/></svg>

// FIX: derive teacher's overall role label from their assignments
function getRoleLabel(teacher: TeacherRow): { label: string; color: string; bg: string } {
  const hasPrimary  = teacher.class_assignments.some(a => a.is_primary)
  const hasSubject  = teacher.class_assignments.some(a => !a.is_primary || a.subject)
  if (hasPrimary && hasSubject) return { label: 'Class + Subject', color: '#F59E0B', bg: '#F59E0B20' }
  if (hasPrimary)               return { label: 'Class Teacher',   color: '#F59E0B', bg: '#F59E0B20' }
  if (hasSubject)               return { label: 'Subject Teacher', color: '#3B82F6', bg: '#3B82F620' }
  return                               { label: 'Unassigned',      color: '#6B7280', bg: '#6B728020' }
}

export default function TeachersClient({ teachers }: Props) {
  const [isDark,    setIsDark]    = useState(true)
  const [mounted,   setMounted]   = useState(false)
  const [search,    setSearch]    = useState('')
  const [selected,  setSelected]  = useState<TeacherRow | null>(null)
  const [roleFilter, setRoleFilter] = useState<'all' | 'class' | 'subject' | 'unassigned'>('all')

  useEffect(() => {
    const s = localStorage.getItem('schoolos_theme')
    const dark = s !== 'light'
    setIsDark(dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    setMounted(true)
  }, [])

  function toggleTheme() {
    const n = !isDark
    setIsDark(n)
    document.documentElement.setAttribute('data-theme', n ? 'dark' : 'light')
    localStorage.setItem('schoolos_theme', n ? 'dark' : 'light')
  }

  const filtered = useMemo(() => {
    return teachers.filter(t => {
      const matchSearch = !search
        || t.full_name.toLowerCase().includes(search.toLowerCase())
        || t.email.toLowerCase().includes(search.toLowerCase())

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

  // Summary counts for filter pills
  const classTeacherCount   = teachers.filter(t => t.class_assignments.some(a => a.is_primary)).length
  const subjectTeacherCount = teachers.filter(t => !t.class_assignments.some(a => a.is_primary) && t.class_assignments.length > 0).length
  const unassignedCount     = teachers.filter(t => t.class_assignments.length === 0).length

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/principal" className={styles.backBtn} style={{ marginBottom: 8, display: 'inline-flex' }}>
            <IconLeft /> Dashboard
          </Link>
          <h1 className={styles.pageTitle}>All <span>Teachers</span></h1>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.themeBtn} onClick={toggleTheme}>
            {isDark ? <IconSun /> : <IconMoon />}
          </button>
        </div>
      </header>

      <div style={{ position: 'relative', zIndex: 1, padding: 'var(--space-6)', maxWidth: 960 }}>

        {/* Role filter pills — FIX */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 'var(--space-4)', flexWrap: 'wrap' as const }}>
          {[
            { key: 'all',        label: `All (${teachers.length})`,           color: 'var(--text-muted)' },
            { key: 'class',      label: `Class Teachers (${classTeacherCount})`,   color: '#F59E0B' },
            { key: 'subject',    label: `Subject Teachers (${subjectTeacherCount})`, color: '#3B82F6' },
            { key: 'unassigned', label: `Unassigned (${unassignedCount})`,     color: '#EF4444' },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setRoleFilter(f.key as any)}
              style={{
                padding: '5px 12px',
                borderRadius: 999,
                border: `1px solid ${roleFilter === f.key ? f.color : 'var(--glass-border)'}`,
                background: roleFilter === f.key ? f.color + '20' : 'transparent',
                color: roleFilter === f.key ? f.color : 'var(--text-muted)',
                fontSize: '0.75rem',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className={styles.filterBar} style={{ marginBottom: 'var(--space-4)' }}>
          <input
            className={styles.searchInput}
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <span style={{ fontSize: '.78rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {filtered.length} of {teachers.length} teachers
          </span>
        </div>

        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.tableHead}>
                <th>Teacher</th>
                <th>Role</th>         {/* FIX: was just "Subjects" */}
                <th>Classes</th>
                <th>Last Active</th>
                <th>Notes</th>
                <th>Results</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className={styles.emptyState}>No teachers found.</div>
                  </td>
                </tr>
              ) : filtered.map(t => {
                const role = getRoleLabel(t)
                return (
                  <tr key={t.id} className={styles.tableRow} onClick={() => setSelected(t)}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>{initials(t.full_name)}</div>
                        <div>
                          <p className={styles.nameCell}>{t.full_name}</p>
                          <p className={styles.metaCell}>{t.email}</p>
                        </div>
                      </div>
                    </td>

                    {/* FIX: Role badge instead of plain text subjects */}
                    <td>
                      <span style={{
                        padding: '3px 8px',
                        borderRadius: 999,
                        background: role.bg,
                        color: role.color,
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        whiteSpace: 'nowrap' as const,
                      }}>
                        {role.label}
                      </span>
                    </td>

                    <td>
                      <span style={{ fontSize: '.78rem', color: 'var(--text-secondary)' }}>
                        {t.classes.slice(0, 2).join(', ')}
                        {t.classes.length > 2 ? ` +${t.classes.length - 2}` : ''}
                        {t.classes.length === 0 ? '—' : ''}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: '.75rem', color: 'var(--text-muted)' }}>
                        {relTime(t.last_activity)}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {t.notes_uploaded}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {t.results_posted}
                      </span>
                    </td>
                    <td>
                      <span className={`${styles.badge} ${t.is_active ? styles.badgeSuccess : styles.badgeError}`}>
                        {t.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail drawer */}
      {selected && (
        <>
          <div className={styles.drawerOverlay} onClick={() => setSelected(null)} />
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerAvatar}>{initials(selected.full_name)}</div>
              <div>
                <p className={styles.drawerName}>{selected.full_name}</p>
                <p className={styles.drawerSub}>{selected.email}</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setSelected(null)}>
                <IconX />
              </button>
            </div>

            <div className={styles.drawerBody}>

              {/* FIX: Role summary */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                {(() => {
                  const r = getRoleLabel(selected)
                  return (
                    <span style={{
                      padding: '5px 14px',
                      borderRadius: 999,
                      background: r.bg,
                      color: r.color,
                      fontSize: '0.75rem',
                      fontWeight: 700,
                    }}>
                      {r.label}
                    </span>
                  )
                })()}
              </div>

              {/* Personal info */}
              <div className={styles.drawerSection}>
                <p className={styles.drawerSectionTitle}>Personal Info</p>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Phone</span>
                  <span className={styles.drawerFieldValue}>{selected.phone ?? '—'}</span>
                </div>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Employee ID</span>
                  <span className={styles.drawerFieldValue}>{selected.employee_id ?? '—'}</span>
                </div>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Qualification</span>
                  <span className={styles.drawerFieldValue}>{selected.qualification ?? '—'}</span>
                </div>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Status</span>
                  <span className={`${styles.badge} ${selected.is_active ? styles.badgeSuccess : styles.badgeError}`}>
                    {selected.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>

              {/* FIX: Full class assignment breakdown */}
              <div className={styles.drawerSection}>
                <p className={styles.drawerSectionTitle}>
                  Class Assignments ({selected.class_assignments.length})
                </p>
                {selected.class_assignments.length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    No classes assigned yet.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {selected.class_assignments.map((a, i) => (
                      <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        background: 'var(--glass-bg)',
                        border: '1px solid var(--glass-border)',
                        borderRadius: 8,
                      }}>
                        <div>
                          <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                            {a.class_name}
                          </p>
                          <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                            {a.subject ?? 'All Subjects'}
                          </p>
                        </div>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 999,
                          background: a.is_primary ? '#F59E0B20' : '#3B82F620',
                          color: a.is_primary ? '#F59E0B' : '#3B82F6',
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.05em',
                        }}>
                          {a.is_primary ? '👑 Class' : 'Subject'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Activity */}
              <div className={styles.drawerSection}>
                <p className={styles.drawerSectionTitle}>Activity</p>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Last Active</span>
                  <span className={styles.drawerFieldValue}>{relTime(selected.last_activity)}</span>
                </div>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Last Action</span>
                  <span className={styles.drawerFieldValue} style={{ maxWidth: '60%', textAlign: 'right' as const }}>
                    {selected.last_action ?? '—'}
                  </span>
                </div>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Notes Uploaded</span>
                  <span className={styles.drawerFieldValue}>{selected.notes_uploaded}</span>
                </div>
                <div className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>Results Posted</span>
                  <span className={styles.drawerFieldValue}>{selected.results_posted}</span>
                </div>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
