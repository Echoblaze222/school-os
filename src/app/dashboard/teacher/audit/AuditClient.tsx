'use client'

// src/app/dashboard/secretary/audit/AuditClient.tsx

import { useEffect, useState, useCallback, useTransition } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import styles from './audit.module.css'
import type { AuditEntry } from './page'

interface Filters {
  action: string
  user:   string
  from:   string
  to:     string
}

interface Props {
  entries:     AuditEntry[]
  totalCount:  number
  page:        number
  actionTypes: string[]
  filters:     Filters
}

const PAGE_SIZE = 50

/* ── Helpers ────────────────────────────────────────────── */
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return {
    date: d.toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: d.toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  }
}

function actionColor(action: string): { bg: string; text: string } {
  const a = action.toLowerCase()
  if (a.includes('delete') || a.includes('remove') || a.includes('deactivat'))
    return { bg: 'var(--error-bg)',   text: 'var(--error)' }
  if (a.includes('create') || a.includes('add') || a.includes('register'))
    return { bg: 'var(--success-bg)', text: 'var(--success)' }
  if (a.includes('update') || a.includes('edit') || a.includes('change') || a.includes('reset'))
    return { bg: 'var(--warning-bg)', text: 'var(--warning)' }
  if (a.includes('login') || a.includes('logout') || a.includes('auth'))
    return { bg: 'var(--info-bg)',    text: 'var(--info)' }
  if (a.includes('export') || a.includes('download') || a.includes('print'))
    return { bg: 'rgba(155,89,182,0.12)', text: '#9B59B6' }
  return { bg: 'var(--glass-bg)', text: 'var(--text-muted)' }
}

function roleColor(role: string): { bg: string; text: string } {
  switch (role.toLowerCase()) {
    case 'teacher':   return { bg: 'var(--success-bg)', text: 'var(--success)' }
    case 'principal': return { bg: 'var(--burgundy-subtle)', text: 'var(--text-accent)' }
    case 'bursar':    return { bg: 'rgba(155,89,182,0.12)', text: '#9B59B6' }
    case 'parent':    return { bg: 'var(--warning-bg)', text: 'var(--warning)' }
    case 'secretary': return { bg: 'rgba(26,188,156,0.12)', text: '#1ABC9C' }
    case 'student':   return { bg: 'var(--info-bg)', text: 'var(--info)' }
    default:          return { bg: 'var(--glass-bg)', text: 'var(--text-muted)' }
  }
}

function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function fmtAction(action: string) {
  return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

/* ── CSV Export ─────────────────────────────────────────── */
function exportCSV(entries: AuditEntry[]) {
  const header = ['Date', 'Time', 'User Name', 'User Role', 'Action', 'Description']
  const rows = entries.map(e => {
    const dt = fmtDateTime(e.logged_at)
    return [
      dt.date, dt.time,
      `"${e.actor_name}"`,
      e.actor_role,
      `"${fmtAction(e.action)}"`,
      `"${(e.details ?? '').replace(/"/g, '""')}"`,
    ].join(',')
  })
  const csv  = [header.join(','), ...rows].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/* ── Bottom Nav ─────────────────────────────────────────── */
function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Secretary navigation">
      <Link href="/dashboard/secretary" className="nav-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
        <span>Home</span>
      </Link>
      <Link href="/dashboard/secretary/users" className="nav-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87"/>
          <path d="M16 3.13a4 4 0 010 7.75"/>
        </svg>
        <span>Users</span>
      </Link>
      <Link href="/dashboard/secretary" className="nav-home" aria-label="Dashboard">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
        </svg>
      </Link>
      <Link href="/dashboard/secretary/audit" className="nav-item active">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="16" y1="13" x2="8" y2="13"/>
          <line x1="16" y1="17" x2="8" y2="17"/>
          <polyline points="10 9 9 9 8 9"/>
        </svg>
        <span>Audit</span>
      </Link>
      <Link href="/dashboard/secretary/ai" className="nav-item">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <span>AI</span>
      </Link>
    </nav>
  )
}

/* ── Filter panel (collapsible on mobile) ─────────────── */
function FilterPanel({
  filters,
  actionTypes,
  onApply,
  onClear,
}: {
  filters:     Filters
  actionTypes: string[]
  onApply:     (f: Filters) => void
  onClear:     () => void
}) {
  const [local, setLocal] = useState<Filters>(filters)
  const [open,  setOpen]  = useState(false)

  const isDirty = Object.values(local).some(v => !!v)

  function handleApply() {
    onApply(local)
    setOpen(false)
  }
  function handleClear() {
    const empty: Filters = { action: '', user: '', from: '', to: '' }
    setLocal(empty)
    onClear()
    setOpen(false)
  }

  return (
    <div className={styles.filterWrap}>
      {/* Filter toggle bar */}
      <div className={styles.filterBar}>
        <button
          className={`${styles.filterToggleBtn} ${open ? styles.filterToggleBtnOpen : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="4" y1="6" x2="20" y2="6"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="11" y1="18" x2="13" y2="18"/>
          </svg>
          Filters
          {isDirty && <span className={styles.filterActiveDot} />}
        </button>

        {isDirty && (
          <button className={styles.filterClearBtn} onClick={handleClear}>
            Clear all
          </button>
        )}
      </div>

      {/* Collapsible filter panel */}
      {open && (
        <div className={`${styles.filterPanel} animate-fade-up`}>
          <div className={styles.filterGrid}>
            {/* Date range */}
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>From date</label>
              <input
                type="date"
                className={`input ${styles.filterInput}`}
                value={local.from}
                max={local.to || undefined}
                onChange={e => setLocal(f => ({ ...f, from: e.target.value }))}
              />
            </div>
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>To date</label>
              <input
                type="date"
                className={`input ${styles.filterInput}`}
                value={local.to}
                min={local.from || undefined}
                onChange={e => setLocal(f => ({ ...f, to: e.target.value }))}
              />
            </div>

            {/* Action type */}
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>Action type</label>
              <select
                className={`input ${styles.filterInput}`}
                value={local.action}
                onChange={e => setLocal(f => ({ ...f, action: e.target.value }))}
              >
                <option value="">All actions</option>
                {actionTypes.map(a => (
                  <option key={a} value={a}>{fmtAction(a)}</option>
                ))}
              </select>
            </div>

            {/* User search */}
            <div className={styles.filterField}>
              <label className={styles.filterLabel}>User name</label>
              <input
                type="text"
                className={`input ${styles.filterInput}`}
                value={local.user}
                onChange={e => setLocal(f => ({ ...f, user: e.target.value }))}
                placeholder="Search by name…"
              />
            </div>
          </div>

          <div className={styles.filterActions}>
            <button className="btn btn-ghost" onClick={handleClear}>Clear</button>
            <button className="btn btn-primary" onClick={handleApply} style={{ flex: 1 }}>
              Apply Filters
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Main Component ─────────────────────────────────────── */
export default function AuditClient({ entries, totalCount, page, actionTypes, filters }: Props) {
  const router   = useRouter()
  const pathname = usePathname()
  const [, startTransition] = useTransition()

  const totalPages  = Math.ceil(totalCount / PAGE_SIZE)
  const hasPrev     = page > 0
  const hasNext     = page < totalPages - 1
  const startRow    = page * PAGE_SIZE + 1
  const endRow      = Math.min((page + 1) * PAGE_SIZE, totalCount)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem('schoolos_theme') ?? 'dark')
  }, [])

  function buildUrl(newFilters: Filters, newPage: number) {
    const p = new URLSearchParams()
    if (newPage > 0)          p.set('page',   String(newPage))
    if (newFilters.action)    p.set('action', newFilters.action)
    if (newFilters.user)      p.set('user',   newFilters.user)
    if (newFilters.from)      p.set('from',   newFilters.from)
    if (newFilters.to)        p.set('to',     newFilters.to)
    const qs = p.toString()
    return qs ? `${pathname}?${qs}` : pathname
  }

  function applyFilters(f: Filters) {
    startTransition(() => router.push(buildUrl(f, 0)))
  }

  function clearFilters() {
    startTransition(() => router.push(pathname))
  }

  function goPage(n: number) {
    startTransition(() => router.push(buildUrl(filters, n)))
  }

  function handleExportCSV() {
    exportCSV(entries)
  }

  const isDirty = Object.values(filters).some(v => !!v)

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} aria-hidden />

      {/* ── Header ── */}
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={() => router.push('/dashboard/secretary')}
          aria-label="Go back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>

        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>Audit Log</h1>
          <p className={styles.headerSub}>
            {isDirty
              ? `${totalCount.toLocaleString()} filtered result${totalCount !== 1 ? 's' : ''}`
              : `${totalCount.toLocaleString()} total entries`
            }
          </p>
        </div>

        <div className={styles.headerActions}>
          <button
            className={styles.themeBtn}
            aria-label="Toggle theme"
            onClick={() => {
              const cur  = document.documentElement.getAttribute('data-theme') ?? 'dark'
              const next = cur === 'dark' ? 'light' : 'dark'
              document.documentElement.setAttribute('data-theme', next)
              localStorage.setItem('schoolos_theme', next)
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
              <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
            </svg>
          </button>

          <button
            className={styles.exportBtn}
            onClick={handleExportCSV}
            disabled={entries.length === 0}
            title="Export current page as CSV"
            aria-label="Export CSV"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            CSV
          </button>
        </div>
      </header>

      {/* ── Filters ── */}
      <FilterPanel
        filters={filters}
        actionTypes={actionTypes}
        onApply={applyFilters}
        onClear={clearFilters}
      />

      {/* ── Stats strip ── */}
      <div className={styles.statsStrip}>
        <span className={styles.statsText}>
          {totalCount > 0
            ? `Showing ${startRow}–${endRow} of ${totalCount.toLocaleString()}`
            : 'No entries found'
          }
        </span>
        {totalPages > 1 && (
          <span className={styles.statsPage}>Page {page + 1} of {totalPages}</span>
        )}
      </div>

      {/* ── Entry list (mobile cards) ── */}
      <main className={styles.main}>
        {entries.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="16" y1="13" x2="8" y2="13"/>
                <line x1="16" y1="17" x2="8" y2="17"/>
              </svg>
            </div>
            <h3 className={styles.emptyTitle}>No audit entries found</h3>
            <p className={styles.emptyBody}>
              {isDirty ? 'Try adjusting your filters.' : 'No activity has been logged yet.'}
            </p>
            {isDirty && (
              <button className="btn btn-ghost" onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        ) : (
          <div className={styles.entryList}>
            {entries.map((entry, i) => {
              const dt   = fmtDateTime(entry.logged_at)
              const ac   = actionColor(entry.action)
              const rc   = roleColor(entry.actor_role)

              return (
                <div
                  key={entry.id}
                  className={`${styles.entryCard} animate-fade-up`}
                  style={{ animationDelay: `${Math.min(i, 15) * 25}ms`, opacity: 0 }}
                >
                  {/* Left: action colour stripe */}
                  <div
                    className={styles.entryStripe}
                    style={{ background: ac.text }}
                    aria-hidden
                  />

                  <div className={styles.entryBody}>
                    {/* Row 1: action + timestamp */}
                    <div className={styles.entryTopRow}>
                      <span
                        className={styles.actionBadge}
                        style={{ background: ac.bg, color: ac.text }}
                      >
                        {fmtAction(entry.action)}
                      </span>
                      <div className={styles.entryTimestamp}>
                        <span className={styles.entryDate}>{dt.date}</span>
                        <span className={styles.entryTime}>{dt.time}</span>
                      </div>
                    </div>

                    {/* Row 2: user info */}
                    <div className={styles.entryUserRow}>
                      <div className={styles.userAvatar} aria-hidden>
                        {initials(entry.actor_name)}
                      </div>
                      <div className={styles.userInfo}>
                        <span className={styles.userName}>{entry.actor_name}</span>
                        <span
                          className={styles.userRole}
                          style={{ background: rc.bg, color: rc.text }}
                        >
                          {entry.actor_role.charAt(0).toUpperCase() + entry.actor_role.slice(1)}
                        </span>
                      </div>
                    </div>

                    {/* Row 3: description */}
                    {entry.details && (
                      <p className={styles.entryDetails}>{entry.details}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className={styles.pagination} aria-label="Pagination">
          <button
            className={`${styles.pageBtn} ${styles.pageBtnPrev}`}
            onClick={() => goPage(page - 1)}
            disabled={!hasPrev}
            aria-label="Previous page"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
            Previous
          </button>

          {/* Page number pills — show 5 around current */}
          <div className={styles.pageNumbers}>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let p: number
              if (totalPages <= 5) {
                p = i
              } else if (page < 3) {
                p = i
              } else if (page >= totalPages - 3) {
                p = totalPages - 5 + i
              } else {
                p = page - 2 + i
              }
              return (
                <button
                  key={p}
                  className={`${styles.pageNum} ${p === page ? styles.pageNumActive : ''}`}
                  onClick={() => goPage(p)}
                  aria-current={p === page ? 'page' : undefined}
                >
                  {p + 1}
                </button>
              )
            })}
          </div>

          <button
            className={`${styles.pageBtn} ${styles.pageBtnNext}`}
            onClick={() => goPage(page + 1)}
            disabled={!hasNext}
            aria-label="Next page"
          >
            Next
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </button>
        </div>
      )}

      <BottomNav />
    </div>
  )
}
