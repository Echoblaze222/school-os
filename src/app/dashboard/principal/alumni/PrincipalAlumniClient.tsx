'use client'

// src/app/dashboard/principal/alumni/PrincipalAlumniClient.tsx

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import styles from './alumni.module.css'
import type { AlumniStudent } from './page'

interface Props { alumni: AlumniStudent[] }

function initials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() }

function exportCSV(rows: AlumniStudent[]) {
  const header = ['Full Name','Admission No.','Class','Graduation Year','Email','Phone','Status']
  const data   = rows.map(r => [
    `"${r.full_name}"`, r.admission_number, r.class_name,
    r.graduation_year ?? '—', r.email ?? '—', r.phone ?? '—',
    r.lifecycle_stage.charAt(0).toUpperCase() + r.lifecycle_stage.slice(1),
  ].join(','))
  const csv  = [header.join(','), ...data].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `alumni_${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export default function PrincipalAlumniClient({ alumni }: Props) {
  const router = useRouter()
  const [search,     setSearch]     = useState('')
  const [yearFilter, setYearFilter] = useState('all')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', localStorage.getItem('schoolos_theme') ?? 'dark')
  }, [])

  const years = useMemo(() =>
    ['all', ...Array.from(new Set(alumni.map(a => a.graduation_year ?? 'Unknown'))).sort().reverse()],
    [alumni]
  )

  const filtered = useMemo(() => alumni.filter(a => {
    if (yearFilter !== 'all' && (a.graduation_year ?? 'Unknown') !== yearFilter) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        a.full_name.toLowerCase().includes(q) ||
        a.admission_number.toLowerCase().includes(q) ||
        (a.graduation_year ?? '').includes(q)
      )
    }
    return true
  }), [alumni, yearFilter, search])

  return (
    <div className={styles.page}>
      <div className={styles.orb1} aria-hidden />

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/principal')} aria-label="Back">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div className={styles.headerText}>
          <h1 className={styles.headerTitle}>Alumni</h1>
          <p className={styles.headerSub}>{alumni.length} graduated student{alumni.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          className={styles.csvBtn}
          onClick={() => exportCSV(filtered)}
          disabled={filtered.length === 0}
          title="Export CSV"
          aria-label="Export CSV"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          CSV
        </button>
      </header>

      {/* Filters */}
      <div className={styles.filterBar}>
        <div className={styles.searchWrap}>
          <svg className={styles.searchIco} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            className={`input ${styles.searchInput}`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search name or admission no…"
            aria-label="Search alumni"
          />
        </div>
        <select
          className={`input ${styles.yearSelect}`}
          value={yearFilter}
          onChange={e => setYearFilter(e.target.value)}
          aria-label="Filter by graduation year"
        >
          {years.map(y => (
            <option key={y} value={y}>{y === 'all' ? 'All Years' : y}</option>
          ))}
        </select>
      </div>

      {/* Stats strip */}
      <div className={styles.statsStrip}>
        <span className={styles.statsText}>
          Showing {filtered.length} of {alumni.length} alumni
        </span>
      </div>

      {/* Content */}
      <main className={styles.main}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
            </div>
            <h3 className={styles.emptyTitle}>
              {alumni.length === 0 ? 'No alumni records yet' : 'No results found'}
            </h3>
            <p className={styles.emptyBody}>
              {alumni.length === 0
                ? 'Students promoted to alumni status will appear here.'
                : 'Try adjusting your search or year filter.'
              }
            </p>
          </div>
        ) : (
          <div className={styles.alumniList}>
            {filtered.map((a, i) => (
              <div
                key={a.id}
                className={`glass-card ${styles.alumniCard} animate-fade-up`}
                style={{ animationDelay: `${Math.min(i, 20) * 40}ms`, opacity: 0 }}
              >
                {/* Avatar */}
                <div className={styles.avatar}>
                  {a.avatar_url
                    ? <img src={a.avatar_url} alt={a.full_name} className={styles.avatarImg} />
                    : <span>{initials(a.full_name)}</span>
                  }
                </div>

                {/* Info */}
                <div className={styles.cardInfo}>
                  <div className={styles.cardNameRow}>
                    <h3 className={styles.cardName}>{a.full_name}</h3>
                    <span className={`${styles.stageBadge} ${a.lifecycle_stage === 'graduated' ? styles.stageBadgeGrad : styles.stageBadgeAlumni}`}>
                      {a.lifecycle_stage === 'graduated' ? '🎓 Graduated' : '⭐ Alumni'}
                    </span>
                  </div>
                  <div className={styles.cardMeta}>
                    <span className={styles.metaItem}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
                      {a.class_name}
                    </span>
                    <span className={styles.metaItem}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                      {a.graduation_year ?? 'Year unknown'}
                    </span>
                    <span className={styles.metaItem}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/></svg>
                      {a.admission_number}
                    </span>
                  </div>
                  {(a.email || a.phone) && (
                    <div className={styles.contactRow}>
                      {a.email && (
                        <a href={`mailto:${a.email}`} className={styles.contactLink}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                          {a.email}
                        </a>
                      )}
                      {a.phone && (
                        <a href={`tel:${a.phone}`} className={styles.contactLink}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 0110.27.37 2 2 0 0112.53 2v3a2 2 0 01-1.67 2 15 15 0 006.29 6.29 2 2 0 012 -1.67h3A2 2 0 0122 16.92z"/></svg>
                          {a.phone}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <nav className="bottom-nav-mobile" aria-label="Principal navigation">
        <Link href="/dashboard/principal" className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          <span>Home</span>
        </Link>
        <Link href="/dashboard/principal/students" className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
          <span>Students</span>
        </Link>
        <Link href="/dashboard/principal" className="nav-home-btn" aria-label="Dashboard">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
        </Link>
        <Link href="/dashboard/principal/alumni" className="nav-item active">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
          <span>Alumni</span>
        </Link>
        <Link href="/dashboard/principal/ai" className="nav-item">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
          <span>AI</span>
        </Link>
      </nav>
    </div>
  )
}
