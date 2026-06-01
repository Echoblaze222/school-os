'use client'
// src/app/dashboard/principal/PrincipalHomeClient.tsx
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { PrincipalDashData } from './types'
import styles from './principal.module.css'

interface Props { data: PrincipalDashData; principalName: string }

function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d/60000)
  if (m<60) return `${m}m ago`
  const h = Math.floor(m/60)
  if (h<24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}
function initials(n: string) { return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }
function getTimeOfDay() { const h=new Date().getHours(); return h<12?'Morning':h<17?'Afternoon':'Evening' }
function ratingClass(s: number) { return s>=85?styles.ratingExcellent:s>=70?styles.ratingGood:s>=50?styles.ratingFair:styles.ratingPoor }
function ratingLabel(s: number) { return s>=85?'Excellent':s>=70?'Good':s>=50?'Fair':'Needs Attention' }

const IconSun=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconHome=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
const IconUsers=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
const IconGrad=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>
const IconBell=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
const IconBar=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
const IconTransfer=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 014-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>
const IconVideo=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>

export default function PrincipalHomeClient({ data, principalName }: Props) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    const s = localStorage.getItem('schoolos_theme')
    const dark = s !== 'light'
    setIsDark(dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    setMounted(true)
  }, [])
  const toggleTheme = () => {
    const next = !isDark; setIsDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('schoolos_theme', next ? 'dark' : 'light')
  }
  if (!mounted) return null
  const hs = data.healthScore
  const score = hs?.score ?? 0

  return (
    <div className={styles.page}>
      <div className={styles.layoutWrap}>
        <nav className={styles.sideNav}>
          <div className={styles.sideNavLogo}>School<span>OS</span></div>
          <Link href="/dashboard/principal" className={`${styles.sideNavItem} ${styles.sideNavItemActive}`}><IconHome /> Overview</Link>
          <Link href="/dashboard/principal/teachers" className={styles.sideNavItem}><IconUsers /> Teachers</Link>
          <Link href="/dashboard/principal/students" className={styles.sideNavItem}><IconGrad /> Students</Link>
          <Link href="/dashboard/principal/results" className={styles.sideNavItem}><IconBar /> Results</Link>
          <Link href="/dashboard/principal/meetings" className={styles.sideNavItem}><IconVideo /> Meetings</Link>
          <Link href="/dashboard/principal/transfers/pending" className={styles.sideNavItem}><IconTransfer /> Transfers {data.pendingTransfers > 0 && <span style={{marginLeft:'auto',background:'var(--error)',color:'#fff',borderRadius:99,padding:'1px 7px',fontSize:'.65rem',fontWeight:800}}>{data.pendingTransfers}</span>}</Link>
          <Link href="/dashboard/principal/announcements" className={styles.sideNavItem}><IconBell /> Announcements</Link>
        </nav>

        <div className={styles.mainCol}>
          <header className={styles.header}>
            <div>
              <p className={styles.greeting}>Good {getTimeOfDay()}</p>
              <h1 className={styles.pageTitle}>{principalName.split(' ')[0]}&apos;s <span>Dashboard</span></h1>
            </div>
            <div className={styles.headerActions}>
              <button className={styles.themeBtn} onClick={toggleTheme}>{isDark ? <IconSun /> : <IconMoon />}</button>
              <Link href="/dashboard/principal/meetings" className={styles.primaryBtn}><IconVideo /> New Meeting</Link>
            </div>
          </header>

          <main className={styles.content}>
            {/* Stats */}
            <div className={styles.statsGrid}>
              <div className={styles.statCard}><div className={`${styles.statIcon} ${styles.statIconBurgundy}`}><IconGrad /></div><span className={styles.statValue}>{data.totalStudents}</span><span className={styles.statLabel}>Students</span></div>
              <div className={styles.statCard}><div className={`${styles.statIcon} ${styles.statIconSuccess}`}><IconUsers /></div><span className={styles.statValue}>{data.totalTeachers}</span><span className={styles.statLabel}>Teachers</span></div>
              <div className={styles.statCard}><div className={`${styles.statIcon} ${styles.statIconInfo}`}><IconBar /></div><span className={styles.statValue}>{data.feeRate}%</span><span className={styles.statLabel}>Fee Rate</span></div>
              <div className={styles.statCard}><div className={`${styles.statIcon} ${styles.statIconWarning}`}><IconTransfer /></div><span className={styles.statValue}>{data.pendingTransfers}</span><span className={styles.statLabel}>Transfers</span></div>
            </div>

            {/* Health Score */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div><p className={styles.cardTitle}>School Health Score</p><p className={styles.cardSubtitle}>{hs ? `Last updated ${relTime(hs.recorded_at)}` : 'No data yet'}</p></div>
                {hs && <span className={`${styles.healthRating} ${ratingClass(score)}`}>{ratingLabel(score)}</span>}
              </div>
              <div className={styles.cardBody}>
                {hs ? (
                  <>
                    <div className={styles.healthScore}>{score}<span>/100</span></div>
                    <div className={styles.healthBar}><div className={styles.healthBarFill} style={{ width: `${score}%` }} /></div>
                    <div className={styles.healthMetrics}>
                      <div className={styles.healthMetric}><span className={styles.healthMetricValue}>{hs.attendance_rate ?? 0}%</span><span className={styles.healthMetricLabel}>Attendance</span></div>
                      <div className={styles.healthMetric}><span className={styles.healthMetricValue}>{hs.fee_rate ?? 0}%</span><span className={styles.healthMetricLabel}>Fee Rate</span></div>
                      <div className={styles.healthMetric}><span className={styles.healthMetricValue}>{hs.results_rate ?? 0}%</span><span className={styles.healthMetricLabel}>Results</span></div>
                    </div>
                  </>
                ) : <div className={styles.emptyState}>No health score recorded yet.</div>}
              </div>
            </div>

            {/* Activity */}
            <div className={styles.card}>
              <div className={styles.cardHeader}>
                <div><p className={styles.cardTitle}>Teacher Activity</p><p className={styles.cardSubtitle}>Recent actions</p></div>
                <Link href="/dashboard/principal/teachers" className={styles.viewAllLink}>View All</Link>
              </div>
              <div className={styles.cardBody}>
                {data.recentActivity.length === 0
                  ? <div className={styles.emptyState}>No recent activity.</div>
                  : data.recentActivity.map(a => (
                    <div key={a.id} className={styles.activityRow}>
                      <div className={styles.activityAvatar}>{initials(a.teacher_name)}</div>
                      <div className={styles.activityBody}>
                        <p className={styles.activityText}><strong>{a.teacher_name}</strong> {a.action}</p>
                        <p className={styles.activityTime}>{relTime(a.created_at)}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  )
}
