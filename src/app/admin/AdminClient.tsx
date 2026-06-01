'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './admin.module.css'

interface Props {
  stats: {
    totalSchools:  number
    activeSchools: number
    totalUsers:    number
    totalStudents: number
    totalRevenue:  number
  }
  recentSchools:  any[]
  subscriptions:  any[]
  recentPayments: any[]
  adminEmail:     string
}

const STATUS_COLORS: Record<string, string> = {
  active:  'badge-success',
  pending: 'badge-warning',
  expired: 'badge-error',
  Trial:   'badge-info',
  Active:  'badge-success',
}

export default function AdminClient({ stats, recentSchools, subscriptions, recentPayments, adminEmail }: Props) {
  const supabase = createClient()
  const [tab,   setTab]   = useState<'overview' | 'schools' | 'revenue' | 'users'>('overview')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [activatingId, setActivatingId] = useState<string | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
  }

  async function toggleSchoolStatus(schoolId: string, currentStatus: string) {
    setActivatingId(schoolId)
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active'
    await supabase
      .from('schools')
      .update({ status: newStatus, is_platform_active: newStatus === 'active' })
      .eq('id', schoolId)
    setActivatingId(null)
    window.location.reload()
  }

  function fmt(n: number) { return `₦${n.toLocaleString()}` }
  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.adminBadge}>⚡</div>
          <div>
            <p className={styles.platformName}>SchoolOS</p>
            <p className={styles.adminLabel}>Platform Admin</p>
          </div>
        </div>
        <div className={styles.headerRight}>
          <span className={styles.adminEmail}>{adminEmail}</span>
          <button className={styles.iconBtn} onClick={toggleTheme}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['overview', 'schools', 'revenue', 'users'] as const).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? '📊 Overview' :
             t === 'schools'  ? '🏫 Schools' :
             t === 'revenue'  ? '💰 Revenue' : '👥 Users'}
          </button>
        ))}
      </div>

      <div className={styles.content}>

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <>
            {/* Key stats */}
            <div className={styles.statsGrid}>
              <div className={`glass-card ${styles.bigStatCard}`}>
                <span className={styles.bigStatEmoji}>🏫</span>
                <p className={styles.bigStatValue}>{stats.totalSchools}</p>
                <p className={styles.bigStatLabel}>Total Schools</p>
                <p className={styles.bigStatSub}>{stats.activeSchools} active</p>
              </div>
              <div className={`glass-card ${styles.bigStatCard}`}>
                <span className={styles.bigStatEmoji}>👥</span>
                <p className={styles.bigStatValue}>{stats.totalUsers.toLocaleString()}</p>
                <p className={styles.bigStatLabel}>Total Users</p>
                <p className={styles.bigStatSub}>{stats.totalStudents.toLocaleString()} students</p>
              </div>
              <div className={`glass-card ${styles.bigStatCard} ${styles.revenueCard}`}>
                <span className={styles.bigStatEmoji}>💰</span>
                <p className={styles.bigStatValue}>{fmt(stats.totalRevenue)}</p>
                <p className={styles.bigStatLabel}>Platform Revenue</p>
                <p className={styles.bigStatSub}>All time</p>
              </div>
            </div>

            {/* Recent schools */}
            <p className={styles.sectionLabel}>🏫 Recently Registered Schools</p>
            {recentSchools.map(school => (
              <div key={school.id} className={`glass-card ${styles.schoolRow}`}>
                <div className={styles.schoolLeft}>
                  <p className={styles.schoolName}>{school.name}</p>
                  <p className={styles.schoolLocation}>
                    {[school.city, school.state].filter(Boolean).join(', ') || 'Nigeria'}
                  </p>
                  <p className={styles.schoolDate}>{fmtDate(school.created_at)}</p>
                </div>
                <div className={styles.schoolRight}>
                  <span className={`badge ${STATUS_COLORS[school.status] ?? 'badge-info'}`}>
                    {school.status}
                  </span>
                  <button
                    className={styles.toggleBtn}
                    onClick={() => toggleSchoolStatus(school.id, school.status)}
                    disabled={activatingId === school.id}
                  >
                    {activatingId === school.id ? '⏳' :
                     school.status === 'active' ? '🔴 Suspend' : '🟢 Activate'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── Schools tab ── */}
        {tab === 'schools' && (
          <>
            <p className={styles.sectionLabel}>All Schools on SchoolOS</p>
            <div className={styles.schoolsGrid}>
              {recentSchools.map(school => (
                <div key={school.id} className={`glass-card ${styles.schoolCard}`}>
                  <div className={styles.schoolCardHeader}>
                    <p className={styles.schoolCardName}>{school.name}</p>
                    <span className={`badge ${STATUS_COLORS[school.status] ?? 'badge-info'}`}>
                      {school.status}
                    </span>
                  </div>
                  <p className={styles.schoolCardLocation}>
                    📍 {[school.city, school.state].filter(Boolean).join(', ')}
                  </p>
                  <p className={styles.schoolCardDate}>Joined {fmtDate(school.created_at)}</p>
                  <div className={styles.schoolCardActions}>
                    <button
                      className={styles.viewBtn}
                      onClick={() => window.open(`/admin/schools/${school.id}`, '_blank')}
                    >
                      👁 View
                    </button>
                    <button
                      className={`${styles.toggleBtn} ${school.status === 'active' ? styles.suspendBtn : styles.activateBtn}`}
                      onClick={() => toggleSchoolStatus(school.id, school.status)}
                      disabled={activatingId === school.id}
                    >
                      {school.status === 'active' ? '🔴 Suspend' : '🟢 Activate'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Revenue tab ── */}
        {tab === 'revenue' && (
          <>
            <div className={`glass-card ${styles.totalRevCard}`}>
              <p className={styles.totalRevLabel}>💰 Total Platform Revenue</p>
              <p className={styles.totalRevAmount}>{fmt(stats.totalRevenue)}</p>
            </div>

            <p className={styles.sectionLabel}>Subscription Payments</p>
            {subscriptions.map((sub, i) => (
              <div key={i} className={`glass-card ${styles.subRow}`}>
                <div className={styles.subLeft}>
                  <p className={styles.subSchool}>{(sub.schools as any)?.name ?? 'Unknown School'}</p>
                  <p className={styles.subPlan}>
                    {sub.plan_type} Plan
                  </p>
                </div>
                <div className={styles.subRight}>
                  <p className={styles.subAmount}>{fmt(sub.amount_paid)}</p>
                  <span className={`badge ${STATUS_COLORS[sub.status] ?? 'badge-info'}`}>
                    {sub.status}
                  </span>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── Users tab ── */}
        {tab === 'users' && (
          <>
            <div className={styles.userStatsRow}>
              <div className={`glass-card ${styles.userStatCard}`}>
                <p className={styles.userStatEmoji}>👥</p>
                <p className={styles.userStatVal}>{stats.totalUsers.toLocaleString()}</p>
                <p className={styles.userStatLabel}>Total Users</p>
              </div>
              <div className={`glass-card ${styles.userStatCard}`}>
                <p className={styles.userStatEmoji}>🎓</p>
                <p className={styles.userStatVal}>{stats.totalStudents.toLocaleString()}</p>
                <p className={styles.userStatLabel}>Students</p>
              </div>
              <div className={`glass-card ${styles.userStatCard}`}>
                <p className={styles.userStatEmoji}>🏫</p>
                <p className={styles.userStatVal}>{stats.totalSchools}</p>
                <p className={styles.userStatLabel}>Schools</p>
              </div>
            </div>

            <p className={styles.sectionLabel}>Platform-wide user breakdown coming soon</p>
            <p className={styles.comingSoonNote}>
              This section will show detailed analytics of users across all schools — active sessions, role distribution, onboarding rates, and more.
            </p>
          </>
        )}

      </div>
    </div>
  )
}
