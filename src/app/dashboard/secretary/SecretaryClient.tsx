'use client'
// src/app/dashboard/secretary/SecretaryClient.tsx

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './secretary.module.css'
import type { PendingUser, AuditEntry, SystemStats } from './page'

interface Props {
  stats: SystemStats
  pendingUsers: PendingUser[]
  auditLog: AuditEntry[]
  secretaryId: string
}

type Tab = 'overview' | 'pending' | 'audit'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

function stageLabel(stage: string) {
  const map: Record<string, string> = {
    stage_1_pending: 'Not logged in',
    stage_2_pending: 'Identity pending',
    stage_3_pending: 'Upload pending',
  }
  return map[stage] ?? stage
}

export default function SecretaryClient({ stats, pendingUsers, auditLog, secretaryId }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('overview')
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [exporting, setExporting] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  useEffect(() => {
    const t = localStorage.getItem('schoolos_theme') as 'light' | 'dark' | null
    if (t) { setTheme(t); document.documentElement.setAttribute('data-theme', t) }
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next); localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  function showToast(msg: string) {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), 3000)
  }

  // ── CSV Export ──────────────────────────────────────────
  async function exportCSV(type: 'students' | 'teachers' | 'payments') {
    setExporting(type)
    try {
      let rows: any[] = []
      let headers: string[] = []
      let filename = ''

      if (type === 'students') {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, email, phone, created_at, onboarding_stage')
          .eq('role', 'student')
        rows = data ?? []
        headers = ['Full Name', 'Email', 'Phone', 'Joined', 'Stage']
        filename = 'students.csv'
      }

      if (type === 'teachers') {
        const { data } = await supabase
          .from('profiles')
          .select('full_name, email, phone, created_at')
          .eq('role', 'teacher')
        rows = data ?? []
        headers = ['Full Name', 'Email', 'Phone', 'Joined']
        filename = 'teachers.csv'
      }

      if (type === 'payments') {
        const { data } = await supabase
          .from('payments')
          .select('receipt_number, amount_paid_ngn, currency_used, payment_method, paid_at')
          .order('paid_at', { ascending: false })
        rows = data ?? []
        headers = ['Receipt No.', 'Amount (NGN)', 'Currency', 'Method', 'Date']
        filename = 'payments.csv'
      }

      // Build CSV string
      const csvLines = [
        headers.join(','),
        ...rows.map(r => Object.values(r).map(v =>
          `"${String(v ?? '').replace(/"/g, '""')}"`
        ).join(','))
      ]
      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url; a.download = filename; a.click()
      URL.revokeObjectURL(url)
      showToast(`✅ ${filename} downloaded`)
    } catch {
      showToast('❌ Export failed. Please try again.')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <p className={styles.headerSub}>Management Console</p>
          <h1 className={styles.headerTitle}>Secretary</h1>
        </div>
        <button className={styles.iconBtn} onClick={toggleTheme}>
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['overview', 'pending', 'audit'] as Tab[]).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? '📊 Overview'
             : t === 'pending' ? `⏳ Pending ({counts?.pendingOnboarding. ?? 0})`
             : '🔍 Audit Log'}
          </button>
        ))}
      </div>

      <main className={styles.main}>

        {/* ── OVERVIEW TAB ── */}
        {tab === 'overview' && (
          <>
            {/* Stats grid */}
            <div className={styles.statsGrid}>
              {[
                { label: 'Total Users',    value: stats.total_users,        icon: '👥' },
                { label: 'Students',       value: stats.total_students,     icon: '🎒' },
                { label: 'Teachers',       value: stats.total_teachers,     icon: '👨‍🏫' },
                { label: 'Parents',        value: stats.total_parents,      icon: '👪' },
                { label: 'Schools',        value: stats.total_schools,      icon: '🏫' },
                { label: 'Pending Setup',  value: stats.pending_onboarding, icon: '⏳', highlight: stats.pending_onboarding > 0 },
              ].map(stat => (
                <div key={stat.label} className={`${styles.statCard} ${stat.highlight ? styles.statCardHighlight : ''}`}>
                  <span className={styles.statIcon}>{stat.icon}</span>
                  <span className={styles.statValue}>{stat.value.toLocaleString()}</span>
                  <span className={styles.statLabel}>{stat.label}</span>
                </div>
              ))}
            </div>

            {/* Export section */}
            <div className={styles.exportSection}>
              <h2 className={styles.sectionTitle}>Data Exports</h2>
              <p className={styles.sectionSub}>Download data as CSV files for records and reporting.</p>

              <div className={styles.exportBtns}>
                {[
                  { type: 'students' as const, label: '🎒 Export Students', sub: `${stats.total_students} records` },
                  { type: 'teachers' as const, label: '👨‍🏫 Export Teachers', sub: `${stats.total_teachers} records` },
                  { type: 'payments' as const, label: '💳 Export Payments', sub: 'All transactions' },
                ].map(exp => (
                  <button
                    key={exp.type}
                    className={styles.exportBtn}
                    onClick={() => exportCSV(exp.type)}
                    disabled={exporting === exp.type}
                  >
                    <div>
                      <p className={styles.exportBtnLabel}>{exp.label}</p>
                      <p className={styles.exportBtnSub}>{exp.sub}</p>
                    </div>
                    {exporting === exp.type ? (
                      <span className={styles.spinner} />
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── PENDING TAB ── */}
        {tab === 'pending' && (
          <div>
            <p className={styles.sectionSub} style={{ marginBottom: 'var(--space-4)' }}>
              Users who have not completed account setup.
            </p>
            {pendingUsers.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyIcon}>✅</p>
                <p className={styles.emptyTitle}>All accounts set up</p>
              </div>
            ) : (
              <div className={styles.pendingList}>
                {pendingUsers.map(u => (
                  <div key={u.id} className={styles.pendingCard}>
                    <div className={styles.pendingLeft}>
                      <p className={styles.pendingName}>{u.full_name}</p>
                      <p className={styles.pendingEmail}>{u.email}</p>
                      <div className={styles.pendingBadges}>
                        <span className={styles.roleBadge}>{u.role}</span>
                        <span className={styles.stageBadge}>{stageLabel(u.onboarding_stage)}</span>
                      </div>
                    </div>
                    <p className={styles.pendingDate}>{new Date(u.created_at).toLocaleDateString()}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── AUDIT TAB ── */}
        {tab === 'audit' && (
          <div>
            <p className={styles.sectionSub} style={{ marginBottom: 'var(--space-4)' }}>
              Last 20 system actions across the portal.
            </p>
            {auditLog.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyIcon}>📋</p>
                <p className={styles.emptyTitle}>No audit entries yet</p>
              </div>
            ) : (
              <div className={styles.auditList}>
                {auditLog.map(entry => (
                  <div key={entry.id} className={styles.auditCard}>
                    <div className={styles.auditLeft}>
                      <p className={styles.auditAction}>{entry.action.replace(/_/g, ' ')}</p>
                      <p className={styles.auditActor}>{entry.actor_name}</p>
                      {entry.target_table && (
                        <span className={styles.auditTable}>{entry.target_table}</span>
                      )}
                    </div>
                    <div className={styles.auditRight}>
                      <p className={styles.auditDate}>{formatDate(entry.logged_at)}</p>
                      {entry.ip_address && (
                        <p className={styles.auditIp}>{entry.ip_address}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Toast */}
      {toastMsg && (
        <div className={styles.toast}>{toastMsg}</div>
      )}

      {/* Bottom nav */}
      <nav className={styles.bottomNav}>
        <button className={`${styles.navItem} ${styles.navItemActive}`} onClick={() => router.push('/dashboard/secretary')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          <span>Home</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/dashboard/secretary/users')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
          <span>Users</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/dashboard/secretary/announcements')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>
          </svg>
          <span>Notices</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/dashboard/secretary/profile')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profile</span>
        </button>
      </nav>
    </div>
  )
}
