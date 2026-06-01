'use client'

// src/app/dashboard/secretary/users/UsersClient.tsx

import { useEffect, useState, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import styles from './users.module.css'
import type { ManagedUser, UserRole } from './page'

interface Props {
  users: ManagedUser[]
  secretaryId: string
}

type RoleFilter = 'all' | UserRole
type OnboardFilter = 'all' | 'complete' | 'pending'

/* ── Constants ──────────────────────────────────────────── */
const ROLES: { value: RoleFilter; label: string }[] = [
  { value: 'all',       label: 'All' },
  { value: 'student',   label: 'Students' },
  { value: 'teacher',   label: 'Teachers' },
  { value: 'parent',    label: 'Parents' },
  { value: 'bursar',    label: 'Bursar' },
  { value: 'principal', label: 'Principal' },
  { value: 'secretary', label: 'Secretary' },
]

const ROLE_COLORS: Record<string, { bg: string; text: string }> = {
  student:   { bg: 'var(--info-bg)',           text: 'var(--info)' },
  teacher:   { bg: 'var(--success-bg)',        text: 'var(--success)' },
  parent:    { bg: 'var(--warning-bg)',        text: 'var(--warning)' },
  bursar:    { bg: 'rgba(155,89,182,0.12)',    text: '#9B59B6' },
  principal: { bg: 'var(--burgundy-subtle)',   text: 'var(--text-accent)' },
  secretary: { bg: 'rgba(26,188,156,0.12)',    text: '#1ABC9C' },
}

/* ── Helpers ────────────────────────────────────────────── */
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}
function formatDate(str: string) {
  return new Date(str).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
}
function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}
function isOnboardingComplete(stage: string) {
  return stage === 'complete' || stage === 'completed'
}

/* ── Bottom Nav ─────────────────────────────────────────── */
function BottomNav({ active }: { active: string }) {
  return (
    <nav className="bottom-nav" aria-label="Secretary navigation">
      <Link href="/dashboard/secretary" className={`nav-item ${active==='home'?'active':''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Home</span>
      </Link>
      <Link href="/dashboard/secretary/users" className={`nav-item ${active==='users'?'active':''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
        <span>Users</span>
      </Link>
      <Link href="/dashboard/secretary" className="nav-home" aria-label="Dashboard">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
      </Link>
      <Link href="/dashboard/secretary/letters" className={`nav-item ${active==='letters'?'active':''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
        <span>Letters</span>
      </Link>
      <Link href="/dashboard/secretary/ai" className={`nav-item ${active==='ai'?'active':''}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <span>AI</span>
      </Link>
    </nav>
  )
}

/* ── Profile Drawer ──────────────────────────────────────── */
function ProfileDrawer({ user, onClose }: { user: ManagedUser; onClose: () => void }) {
  const rc = ROLE_COLORS[user.role] ?? ROLE_COLORS.student
  return (
    <div className={styles.drawerOverlay} onClick={onClose}>
      <div className={styles.drawer} onClick={e => e.stopPropagation()}>
        <div className={styles.drawerHandle} />

        <div className={styles.drawerAvatar}>
          {user.avatar_url
            ? <img src={user.avatar_url} alt={user.full_name} className={styles.drawerAvatarImg} />
            : <span>{initials(user.full_name)}</span>
          }
        </div>

        <h2 className={styles.drawerName}>{user.full_name}</h2>
        <span className={styles.drawerRoleBadge} style={{ background: rc.bg, color: rc.text }}>
          {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
        </span>

        <div className={styles.drawerFields}>
          {[
            { label: 'Email',      value: user.email },
            { label: 'Phone',      value: user.phone ?? '—' },
            { label: 'Role',       value: user.role },
            { label: 'Onboarding', value: isOnboardingComplete(user.onboarding_stage) ? 'Complete' : user.onboarding_stage },
            { label: 'Status',     value: user.is_active ? 'Active' : 'Deactivated' },
            { label: 'Joined',     value: formatDate(user.created_at) },
            ...(user.class_name ? [{ label: 'Class', value: user.class_name }] : []),
            ...(user.subject    ? [{ label: 'Subject', value: user.subject }] : []),
            ...(user.staff_id   ? [{ label: 'Staff ID', value: user.staff_id }] : []),
            ...(user.default_code ? [{ label: 'Access Code', value: user.default_code }] : []),
          ].map(({ label, value }) => (
            <div key={label} className={styles.drawerField}>
              <span className={styles.drawerFieldLabel}>{label}</span>
              <span className={styles.drawerFieldValue}>{value}</span>
            </div>
          ))}
        </div>

        <button className="btn btn-ghost" style={{ width: '100%', marginTop: 'var(--space-4)' }} onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}

/* ── Add User Modal ──────────────────────────────────────── */
function AddUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (user: ManagedUser) => void
}) {
  const [form, setForm] = useState({ full_name: '', email: '', role: 'student' as UserRole, phone: '' })
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [created, setCreated]   = useState<{ user: ManagedUser; code: string } | null>(null)

  async function handleCreate() {
    if (!form.full_name.trim() || !form.email.trim()) {
      setError('Full name and email are required.')
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(form.email)) {
      setError('Enter a valid email address.')
      return
    }
    setLoading(true)
    setError('')

    const code = generateCode()
    const supabase = createClient()

    try {
      // Create auth user via admin API endpoint
      const res = await fetch('/api/secretary/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name:    form.full_name.trim(),
          email:        form.email.trim(),
          role:         form.role,
          phone:        form.phone.trim() || null,
          default_code: code,
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create user')

      const newUser: ManagedUser = {
        id:               data.userId,
        full_name:        form.full_name.trim(),
        email:            form.email.trim(),
        phone:            form.phone.trim() || null,
        role:             form.role,
        onboarding_stage: 'pending',
        is_active:        true,
        default_code:     code,
        created_at:       new Date().toISOString(),
        avatar_url:       null,
        last_sign_in:     null,  // ✅ fixed
      }

      setCreated({ user: newUser, code })
      onCreated(newUser)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Add New User</h2>
          <button className={styles.modalClose} onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        {created ? (
          <div className={styles.createdSuccess}>
            <div className={styles.createdIcon}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h3 className={styles.createdTitle}>{created.user.full_name} created!</h3>
            <p className={styles.createdSub}>Share this access code with the user:</p>
            <div className={styles.codeDisplay}>
              <span className={styles.codeValue}>{created.code}</span>
              <button
                className={styles.codeCopyBtn}
                onClick={() => navigator.clipboard.writeText(created.code)}
                title="Copy code"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
              </button>
            </div>
            <p className={styles.createdNote}>The user will be prompted to change this code on first login.</p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={onClose}>Done</button>
          </div>
        ) : (
          <>
            <div className={styles.modalBody}>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Full Name <span style={{ color: 'var(--text-accent)' }}>*</span></label>
                <input className="input" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} placeholder="e.g. Amara Johnson" />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Email <span style={{ color: 'var(--text-accent)' }}>*</span></label>
                <input className="input" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="e.g. amara@email.com" />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Role</label>
                <select
                  className={`input ${styles.select}`}
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
                >
                  {ROLES.filter(r => r.value !== 'all').map(r => (
                    <option key={r.value} value={r.value}>{r.label.replace(/s$/, '')}</option>
                  ))}
                </select>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.label}>Phone <span className={styles.optional}>(optional)</span></label>
                <input className="input" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+234 800 000 0000" />
              </div>

              {error && (
                <div className={styles.formError}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {error}
                </div>
              )}
            </div>

            <div className={styles.modalFooter}>
              <button className="btn btn-ghost" onClick={onClose} disabled={loading}>Cancel</button>
              <button
                className="btn btn-primary"
                onClick={handleCreate}
                disabled={loading}
                style={{ flex: 1 }}
              >
                {loading ? <><span className={styles.spinner} />Creating…</> : 'Create User'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ── User Row ────────────────────────────────────────────── */
function UserRow({
  user,
  index,
  onViewProfile,
  onUserUpdated,
}: {
  user: ManagedUser
  index: number
  onViewProfile: (u: ManagedUser) => void
  onUserUpdated: (id: string, patch: Partial<ManagedUser>) => void
}) {
  const [resetLoading,    setResetLoading]    = useState(false)
  const [onboardLoading,  setOnboardLoading]  = useState(false)
  const [deactivateLoad,  setDeactivateLoad]  = useState(false)
  const [newCode,         setNewCode]         = useState<string | null>(null)
  const [actionError,     setActionError]     = useState('')

  const rc = ROLE_COLORS[user.role] ?? ROLE_COLORS.student
  const isComplete = isOnboardingComplete(user.onboarding_stage)

  async function handleResetCode() {
    setResetLoading(true)
    setActionError('')
    setNewCode(null)
    const code = generateCode()
    const supabase = createClient()
    const { error } = await supabase
      .from('user_profiles')
      .update({ default_code: code })
      .eq('id', user.id)
    if (error) { setActionError('Reset failed: ' + error.message); setResetLoading(false); return }
    setNewCode(code)
    onUserUpdated(user.id, { default_code: code })
    setResetLoading(false)
  }

  async function handleCompleteOnboarding() {
    setOnboardLoading(true)
    setActionError('')
    const supabase = createClient()
    const { error } = await supabase
      .from('user_profiles')
      .update({ onboarding_stage: 'complete' })
      .eq('id', user.id)
    if (error) { setActionError('Update failed: ' + error.message); setOnboardLoading(false); return }
    onUserUpdated(user.id, { onboarding_stage: 'complete' })
    setOnboardLoading(false)
  }

  async function handleDeactivate() {
    if (!window.confirm(`Deactivate ${user.full_name}? They will not be able to log in.`)) return
    setDeactivateLoad(true)
    setActionError('')
    const supabase = createClient()
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: false })
      .eq('id', user.id)
    if (error) { setActionError('Deactivate failed: ' + error.message); setDeactivateLoad(false); return }
    onUserUpdated(user.id, { is_active: false })
    setDeactivateLoad(false)
  }

  async function handleReactivate() {
    setDeactivateLoad(true)
    const supabase = createClient()
    const { error } = await supabase
      .from('user_profiles')
      .update({ is_active: true })
      .eq('id', user.id)
    if (!error) onUserUpdated(user.id, { is_active: true })
    setDeactivateLoad(false)
  }

  return (
    <div
      className={`${styles.userRow} ${!user.is_active ? styles.userRowInactive : ''} animate-fade-up`}
      style={{ animationDelay: `${index * 30}ms`, opacity: 0 }}
    >
      {/* Avatar + info */}
      <div className={styles.userMain}>
        <div className={styles.userAvatar}>
          {user.avatar_url
            ? <img src={user.avatar_url} alt={user.full_name} className={styles.userAvatarImg} />
            : <span>{initials(user.full_name)}</span>
          }
          {!user.is_active && <div className={styles.inactiveDot} title="Deactivated" />}
        </div>
        <div className={styles.userInfo}>
          <div className={styles.userNameRow}>
            <span className={styles.userName}>{user.full_name}</span>
            <span className={styles.userRoleBadge} style={{ background: rc.bg, color: rc.text }}>
              {user.role}
            </span>
          </div>
          <span className={styles.userEmail}>{user.email}</span>
          <div className={styles.userMeta}>
            <span
              className={styles.onboardBadge}
              style={{
                background: isComplete ? 'var(--success-bg)' : 'var(--warning-bg)',
                color:      isComplete ? 'var(--success)'    : 'var(--warning)',
              }}
            >
              {isComplete ? '✓ Onboarded' : '⏳ Pending'}
            </span>
            <span className={styles.userDate}>{formatDate(user.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className={styles.userActions}>
        <button className={styles.actionBtn} onClick={() => onViewProfile(user)} title="View profile">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          <span>Profile</span>
        </button>

        <button
          className={styles.actionBtn}
          onClick={handleResetCode}
          disabled={resetLoading}
          title="Reset access code"
        >
          {resetLoading
            ? <span className={styles.spinnerSm} />
            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
          }
          <span>Reset Code</span>
        </button>

        {!isComplete && (
          <button
            className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
            onClick={handleCompleteOnboarding}
            disabled={onboardLoading}
            title="Mark onboarding complete"
          >
            {onboardLoading
              ? <span className={styles.spinnerSm} />
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            }
            <span>Complete</span>
          </button>
        )}

        {user.is_active ? (
          <button
            className={`${styles.actionBtn} ${styles.actionBtnDanger}`}
            onClick={handleDeactivate}
            disabled={deactivateLoad}
            title="Deactivate user"
          >
            {deactivateLoad
              ? <span className={styles.spinnerSm} />
              : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            }
            <span>Deactivate</span>
          </button>
        ) : (
          <button
            className={`${styles.actionBtn} ${styles.actionBtnSuccess}`}
            onClick={handleReactivate}
            disabled={deactivateLoad}
            title="Reactivate user"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/></svg>
            <span>Reactivate</span>
          </button>
        )}
      </div>

      {/* Reset code reveal */}
      {newCode && (
        <div className={styles.codeReveal}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          New code: <strong>{newCode}</strong>
          <button className={styles.codeCopySmBtn} onClick={() => navigator.clipboard.writeText(newCode)} title="Copy">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
          </button>
          <button className={styles.codeDismiss} onClick={() => setNewCode(null)}>✕</button>
        </div>
      )}

      {actionError && (
        <p className={styles.rowError}>{actionError}</p>
      )}
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────── */
export default function UsersClient({ users: initialUsers, secretaryId }: Props) {
  const router = useRouter()
  const [users, setUsers]               = useState<ManagedUser[]>(initialUsers)
  const [roleFilter, setRoleFilter]     = useState<RoleFilter>('all')
  const [onboardFilter, setOnboardFilter] = useState<OnboardFilter>('all')
  const [search, setSearch]             = useState('')
  const [profileUser, setProfileUser]   = useState<ManagedUser | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)

  useEffect(() => {
    const theme = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  function handleUserUpdated(id: string, patch: Partial<ManagedUser>) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...patch } : u))
  }

  function handleUserCreated(newUser: ManagedUser) {
    setUsers(prev => [newUser, ...prev])
  }

  const filtered = useMemo(() => {
    return users.filter(u => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (onboardFilter === 'complete' && !isOnboardingComplete(u.onboarding_stage)) return false
      if (onboardFilter === 'pending'  && isOnboardingComplete(u.onboarding_stage))  return false
      if (search.trim()) {
        const q = search.toLowerCase()
        return (
          u.full_name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [users, roleFilter, onboardFilter, search])

  // Stats
  const pendingCount  = users.filter(u => !isOnboardingComplete(u.onboarding_stage)).length
  const activeCount   = users.filter(u => u.is_active).length
  const studentCount  = users.filter(u => u.role === 'student').length

  return (
    <div className={styles.page}>
      <div className={`burgundy-glow-orb ${styles.orb1}`} aria-hidden />
      <div className={`burgundy-glow-orb ${styles.orb2}`} aria-hidden />

      {/* ── Header ── */}
      <header className={styles.header}>
        <button onClick={() => router.push('/dashboard/secretary')} className={styles.backBtn} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>User Management</h1>
          <p className={styles.subtitle}>{users.length} total users</p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.themeBtn}
            aria-label="Toggle theme"
            onClick={() => {
              const c = document.documentElement.getAttribute('data-theme') ?? 'dark'
              const n = c === 'dark' ? 'light' : 'dark'
              document.documentElement.setAttribute('data-theme', n)
              localStorage.setItem('schoolos_theme', n)
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
          </button>
          <button
            className={`btn btn-primary ${styles.addBtn}`}
            onClick={() => setShowAddModal(true)}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            Add
          </button>
        </div>
      </header>

      {/* ── Stats Strip ── */}
      <div className={`animate-fade-up ${styles.statsStrip}`}>
        <div className={styles.stat}><span className={styles.statVal}>{users.length}</span><span className={styles.statLbl}>Total</span></div>
        <div className={styles.statDiv} />
        <div className={styles.stat}><span className={styles.statVal}>{activeCount}</span><span className={styles.statLbl}>Active</span></div>
        <div className={styles.statDiv} />
        <div className={styles.stat}>
          <span className={styles.statVal} style={{ color: pendingCount > 0 ? 'var(--warning)' : undefined }}>{pendingCount}</span>
          <span className={styles.statLbl}>Pending</span>
        </div>
        <div className={styles.statDiv} />
        <div className={styles.stat}><span className={styles.statVal}>{studentCount}</span><span className={styles.statLbl}>Students</span></div>
      </div>

      {/* ── Filters ── */}
      <div className={styles.filtersWrap}>
        {/* Role filter */}
        <div className={styles.roleFilters}>
          {ROLES.map(r => (
            <button
              key={r.value}
              className={`${styles.filterChip} ${roleFilter === r.value ? styles.filterChipActive : ''}`}
              onClick={() => setRoleFilter(r.value)}
            >
              {r.label}
              {r.value !== 'all' && (
                <span className={styles.filterCount}>
                  {users.filter(u => u.role === r.value).length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Onboarding filter + Search row */}
        <div className={styles.filterRow2}>
          <div className={styles.onboardToggle}>
            {(['all', 'complete', 'pending'] as OnboardFilter[]).map(v => (
              <button
                key={v}
                className={`${styles.onboardBtn} ${onboardFilter === v ? styles.onboardBtnActive : ''}`}
                onClick={() => setOnboardFilter(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          <div className={styles.searchWrap}>
            <svg className={styles.searchIcon} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              className={`input ${styles.searchInput}`}
              placeholder="Search name or email…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              aria-label="Search users"
            />
            {search && (
              <button className={styles.clearSearch} onClick={() => setSearch('')} aria-label="Clear">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>
        </div>

        <p className={styles.resultCount}>{filtered.length} user{filtered.length !== 1 ? 's' : ''} shown</p>
      </div>

      {/* ── User List ── */}
      <main className={styles.main}>
        {filtered.length === 0 ? (
          <div className={`glass-card ${styles.emptyState}`}>
            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.4, color: 'var(--text-muted)' }}>
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/>
            </svg>
            <p className={styles.emptyTitle}>No users found</p>
            <p className={styles.emptyBody}>Try adjusting your filters or search term.</p>
          </div>
        ) : (
          <div className={styles.userList}>
            {filtered.map((u, i) => (
              <UserRow
                key={u.id}
                user={u}
                index={i}
                onViewProfile={setProfileUser}
                onUserUpdated={handleUserUpdated}
              />
            ))}
          </div>
        )}
      </main>

      {/* Modals */}
      {profileUser && (
        <ProfileDrawer user={profileUser} onClose={() => setProfileUser(null)} />
      )}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleUserCreated}
        />
      )}

      <BottomNav active="users" />
    </div>
  )
}