'use client'
// src/app/dashboard/secretary/users/UserManagementClient.tsx

import { useEffect, useState, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ManagedUser, UserRole } from './page'
import type { ClassOption } from '../../principal/types'
import styles from './users.module.css'

interface Props {
  users: ManagedUser[]
  classOptions: ClassOption[]
  currentUserId: string
}

const ROLES: UserRole[] = ['student', 'teacher', 'bursar', 'secretary', 'principal', 'admin', 'parent']
const ROLE_LABELS: Record<UserRole, string> = { student: 'Student', teacher: 'Teacher', bursar: 'Bursar', secretary: 'Secretary', principal: 'Principal', admin: 'Admin', parent: 'Parent' }

function roleBadgeClass(role: UserRole): string {
  const map: Record<UserRole, string> = { student: styles.roleStudent, teacher: styles.roleTeacher, bursar: styles.roleBursar, secretary: styles.roleSecretary, principal: styles.rolePrincipal, admin: styles.roleAdmin, parent: styles.roleParent }
  return map[role] ?? ''
}

function initials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() }

function relTime(iso: string | null) {
  if (!iso) return 'Never'
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const days = Math.floor(h / 24)
  if (days < 30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
}

const IconSun = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconSearch = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IconPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconX = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconAlertCircle = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
const IconMail = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>

export default function UserManagementClient({ users: initialUsers, classOptions, currentUserId }: Props) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [users, setUsers] = useState<ManagedUser[]>(initialUsers)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [selected, setSelected] = useState<ManagedUser | null>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Edit form state
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editRole, setEditRole] = useState<UserRole>('student')
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<UserRole>('student')
  const [inviteName, setInviteName] = useState('')
  const [isInviting, setIsInviting] = useState(false)
  const [inviteStatus, setInviteStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [inviteError, setInviteError] = useState('')

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme')
    const dark = saved !== 'light'
    setIsDark(dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    setMounted(true)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('schoolos_theme', next ? 'dark' : 'light')
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return users.filter(u => {
      const matchSearch = !q || u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      const matchRole = !roleFilter || u.role === roleFilter
      return matchSearch && matchRole
    })
  }, [users, search, roleFilter])

  // Stats
  const stats = useMemo(() => ({
    total: users.length,
    students: users.filter(u => u.role === 'student').length,
    teachers: users.filter(u => u.role === 'teacher').length,
    active: users.filter(u => u.is_active).length,
  }), [users])

  function openEdit(u: ManagedUser) {
    setSelected(u)
    setEditName(u.full_name)
    setEditPhone(u.phone ?? '')
    setEditRole(u.role)
    setIsEditing(true)
    setSaveStatus('idle')
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function saveEdit() {
    if (!selected) return
    setIsSaving(true)
    setSaveStatus('idle')
    const supabase = createClient()

    const { error } = await supabase
      .from('profiles')
      .update({ full_name: editName.trim(), phone: editPhone.trim() || null, role: editRole })
      .eq('id', selected.id)

    setIsSaving(false)
    if (error) {
      setSaveStatus('error')
      setSaveError(error.message)
    } else {
      setSaveStatus('success')
      setUsers(prev => prev.map(u => u.id === selected.id
        ? { ...u, full_name: editName.trim(), phone: editPhone.trim() || null, role: editRole }
        : u))
      setSelected(prev => prev ? { ...prev, full_name: editName.trim(), phone: editPhone.trim() || null, role: editRole } : null)
      setTimeout(() => { setIsEditing(false); setSaveStatus('idle') }, 1500)
    }
  }

  async function toggleActive(u: ManagedUser) {
    const supabase = createClient()
    const next = !u.is_active
    const { error } = await supabase
      .from('profiles')
      .update({ is_active: next })
      .eq('id', u.id)

    if (!error) {
      setUsers(prev => prev.map(p => p.id === u.id ? { ...p, is_active: next } : p))
      setSelected(prev => prev?.id === u.id ? { ...prev, is_active: next } : prev)
      showToast(`${u.full_name} ${next ? 'activated' : 'deactivated'}`)
    }
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) return
    setIsInviting(true)
    setInviteStatus('idle')
    const supabase = createClient()

    // Insert a pending invite / pre-created profile
    const { error } = await supabase
      .from('profiles')
      .insert({
        email: inviteEmail.trim().toLowerCase(),
        full_name: inviteName.trim() || inviteEmail.split('@')[0],
        role: inviteRole,
        is_active: false,
      })

    setIsInviting(false)
    if (error) {
      setInviteStatus('error')
      setInviteError(error.message)
    } else {
      setInviteStatus('success')
      setTimeout(() => {
        setShowInvite(false)
        setInviteEmail('')
        setInviteName('')
        setInviteRole('student')
        setInviteStatus('idle')
        showToast(`Invite sent to ${inviteEmail}`)
      }, 1500)
    }
  }

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <h1 className={styles.pageTitle}>User <span>Management</span></h1>
            <p className={styles.pageSubtitle}>{users.length} total users · {stats.active} active</p>
          </div>
          <div className={styles.headerRight}>
            <button className={styles.themeBtn} onClick={toggleTheme}>{isDark ? <IconSun /> : <IconMoon />}</button>
            <button className={styles.inviteBtn} onClick={() => setShowInvite(true)}>
              <IconPlus /> Invite User
            </button>
          </div>
        </div>

        <div className={styles.filterBar}>
          <div className={styles.searchWrap}>
            <span className={styles.searchIcon}><IconSearch /></span>
            <input className={styles.searchInput} placeholder="Search name or email…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select className={styles.roleFilter} value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
      </header>

      <main className={styles.content}>
        {/* Stats */}
        <div className={styles.statsRow}>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.total}</span><span className={styles.statLabel}>Total Users</span></div>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.students}</span><span className={styles.statLabel}>Students</span></div>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.teachers}</span><span className={styles.statLabel}>Teachers</span></div>
          <div className={styles.statCard}><span className={styles.statValue}>{stats.active}</span><span className={styles.statLabel}>Active</span></div>
        </div>

        <p className={styles.resultsMeta}>Showing {filtered.length} of {users.length} users</p>

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>No users match your filters.</div>
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.tableHead}>
                <tr>
                  <th>User</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Last Seen</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <tr key={u.id} className={styles.tableRow} onClick={() => { setSelected(u); setIsEditing(false) }}>
                    <td>
                      <div className={styles.userCell}>
                        <div className={styles.avatar}>{initials(u.full_name)}</div>
                        <div>
                          <p className={styles.userName}>{u.full_name}{u.id === currentUserId ? ' (You)' : ''}</p>
                          <p className={styles.userEmail}>{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td><span className={`${styles.roleBadge} ${roleBadgeClass(u.role)}`}>{ROLE_LABELS[u.role]}</span></td>
                    <td>
                      <div className={styles.activeIndicator}>
                        <div className={`${styles.dot} ${u.is_active ? styles.dotActive : styles.dotInactive}`} />
                        <span className={u.is_active ? styles.activeText : styles.inactiveText}>
                          {u.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </td>
                    <td><span className={styles.lastSeen}>{relTime(u.last_sign_in)}</span></td>
                    <td>
                      <button className={styles.actionBtn} onClick={e => { e.stopPropagation(); openEdit(u) }}>Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── User Detail Drawer ─────────────────────────── */}
      {selected && (
        <>
          <div className={styles.drawerOverlay} onClick={() => { setSelected(null); setIsEditing(false) }} />
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerAvatar}>{initials(selected.full_name)}</div>
              <div>
                <p className={styles.drawerName}>{selected.full_name}</p>
                <p className={styles.drawerEmail}>{selected.email}</p>
              </div>
              <button className={styles.closeBtn} onClick={() => { setSelected(null); setIsEditing(false) }}><IconX /></button>
            </div>

            <div className={styles.drawerBody}>
              {!isEditing ? (
                <>
                  <div className={styles.drawerSection}>
                    <p className={styles.drawerSectionTitle}>Account</p>
                    <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Role</span><span className={`${styles.roleBadge} ${roleBadgeClass(selected.role)}`}>{ROLE_LABELS[selected.role]}</span></div>
                    <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Status</span><div className={styles.activeIndicator}><div className={`${styles.dot} ${selected.is_active ? styles.dotActive : styles.dotInactive}`}/><span className={selected.is_active ? styles.activeText : styles.inactiveText}>{selected.is_active ? 'Active' : 'Inactive'}</span></div></div>
                    <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Phone</span><span className={styles.drawerFieldValue}>{selected.phone ?? '—'}</span></div>
                    <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Last seen</span><span className={styles.drawerFieldValue}>{relTime(selected.last_sign_in)}</span></div>
                    <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Joined</span><span className={styles.drawerFieldValue}>{new Date(selected.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})}</span></div>
                  </div>

                  {selected.role === 'student' && (
                    <div className={styles.drawerSection}>
                      <p className={styles.drawerSectionTitle}>Student Info</p>
                      <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Class</span><span className={styles.drawerFieldValue}>{selected.class_name ?? '—'}</span></div>
                      <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Admission No.</span><span className={styles.drawerFieldValue}>{selected.student_number ?? '—'}</span></div>
                    </div>
                  )}

                  {selected.role === 'teacher' && (selected.subjects ?? []).length > 0 && (
  <div className={styles.drawerSection}>
    <p className={styles.drawerSectionTitle}>Subjects</p>
    <div className={styles.drawerField}>
      <span className={styles.drawerFieldLabel}>Teaches</span>
      <span className={styles.drawerFieldValue}>{(selected.subjects ?? []).join(', ')}</span>
    </div>
  </div>
)}
                </>
              ) : (
                <>
                  {saveStatus === 'success' && <div className={styles.statusSuccess}><IconCheck /> Changes saved!</div>}
                  {saveStatus === 'error'   && <div className={styles.statusError}><IconAlertCircle /> {saveError}</div>}

                  <div className={styles.drawerSection}>
                    <p className={styles.drawerSectionTitle}>Edit Profile</p>
                    <div className={styles.editField}>
                      <label className={styles.editLabel}>Full Name</label>
                      <input className={styles.editInput} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Full name" />
                    </div>
                    <div className={styles.editField}>
                      <label className={styles.editLabel}>Phone</label>
                      <input className={styles.editInput} value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="+234…" />
                    </div>
                    <div className={styles.editField}>
                      <label className={styles.editLabel}>Role</label>
                      <select className={`${styles.editInput} ${styles.editSelect}`} value={editRole} onChange={e => setEditRole(e.target.value as UserRole)}>
                        {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className={styles.drawerActions}>
              {!isEditing ? (
                <>
                  <button className={styles.drawerSecondaryBtn} onClick={() => openEdit(selected)}>Edit Profile</button>
                  <button
                    className={selected.is_active ? styles.drawerDangerBtn : styles.drawerPrimaryBtn}
                    onClick={() => toggleActive(selected)}
                    disabled={selected.id === currentUserId}
                  >
                    {selected.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                </>
              ) : (
                <>
                  <button className={styles.drawerSecondaryBtn} onClick={() => setIsEditing(false)}>Cancel</button>
                  <button className={styles.drawerPrimaryBtn} onClick={saveEdit} disabled={isSaving || !editName.trim()}>
                    {isSaving ? 'Saving…' : 'Save Changes'}
                  </button>
                </>
              )}
            </div>
          </aside>
        </>
      )}

      {/* ── Invite Modal ──────────────────────────────── */}
      {showInvite && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <p className={styles.modalTitle}>Invite New User</p>

            {inviteStatus === 'success' && <div className={styles.statusSuccess}><IconCheck /> Invite sent!</div>}
            {inviteStatus === 'error'   && <div className={styles.statusError}><IconAlertCircle /> {inviteError}</div>}

            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Full Name</label>
              <input className={styles.modalInput} placeholder="e.g. Amara Osei" value={inviteName} onChange={e => setInviteName(e.target.value)} />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Email Address *</label>
              <input className={styles.modalInput} type="email" placeholder="user@school.edu.ng" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <div className={styles.modalField}>
              <label className={styles.modalLabel}>Role *</label>
              <select className={`${styles.modalInput} ${styles.modalSelect}`} value={inviteRole} onChange={e => setInviteRole(e.target.value as UserRole)}>
                {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
            </div>

            <div className={styles.modalActions}>
              <button className={styles.modalSecondary} onClick={() => { setShowInvite(false); setInviteStatus('idle') }}>Cancel</button>
              <button className={styles.modalPrimary} onClick={sendInvite} disabled={isInviting || !inviteEmail.trim()}>
                <IconMail />  {isInviting ? 'Sending…' : 'Send Invite'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  )
}
