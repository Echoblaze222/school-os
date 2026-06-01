'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChartIcon, CreditCardIcon, AlertCircleIcon, UsersIcon,
  ArrowLeftIcon, SunIcon, MoonIcon, TrendingUpIcon, CheckCircleIcon,
} from '@/components/Icons'
import styles from './fees.module.css'

export default function PrincipalFeesClient({
  stats, classFees, recentPayments, overdueInvoices, schoolId,
}: any) {
  const router = useRouter()
  const [tab,   setTab]   = useState<'overview' | 'classes' | 'overdue' | 'recent'>('overview')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next); localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
  }

  const collectionRate = stats.totalExpected > 0
    ? Math.round((stats.totalCollected / stats.totalExpected) * 100)
    : 0

  // Group class fees
  const classBreakdown = useMemo(() => {
    const map: Record<string, { due: number; paid: number; count: number; label: string }> = {}

    classFees.forEach((inv: any) => {
      const student = inv['profiles!student_id'] as any
      const sp      = student?.student_profiles as any
      const cls     = sp?.classes as any
      const key     = cls?.id ?? 'unknown'
      const label   = cls ? `${cls.level} ${cls.section}` : 'Unknown Class'

      if (!map[key]) map[key] = { due: 0, paid: 0, count: 0, label }
      map[key].due   += inv.amount_due_ngn   || 0
      map[key].paid  += inv.amount_paid_ngn  || 0
      map[key].count++
    })

    return Object.entries(map)
      .map(([id, d]) => ({
        id,
        label: d.label,
        due:   d.due,
        paid:  d.paid,
        count: d.count,
        rate:  d.due > 0 ? Math.round((d.paid / d.due) * 100) : 0,
      }))
      .sort((a, b) => b.due - a.due)
  }, [classFees])

  function fmt(n: number) {
    return `₦${n.toLocaleString()}`
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  const rateColor = collectionRate >= 80 ? 'var(--success)'
    : collectionRate >= 50 ? 'var(--warning)'
    : 'var(--error)'

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/principal')}>
          <ArrowLeftIcon size={18} />
        </button>
        <h1 className={styles.headerTitle}>Fee Overview</h1>
        <button className={styles.iconBtn} onClick={toggleTheme}>
          {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
        </button>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        {(['overview', 'classes', 'overdue', 'recent'] as const).map(t => (
          <button
            key={t}
            className={`${styles.tab} ${tab === t ? styles.tabActive : ''}`}
            onClick={() => setTab(t)}
          >
            {t === 'overview' ? 'Overview' :
             t === 'classes'  ? 'By Class' :
             t === 'overdue'  ? `Overdue ${stats.overdue > 0 ? `(${stats.overdue})` : ''}` :
             'Recent'}
          </button>
        ))}
      </div>

      <div className={styles.content}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <>
            {/* Collection rate card */}
            <div className={styles.rateCard}>
              <div className={styles.rateTop}>
                <div>
                  <p className={styles.rateLabel}>Collection Rate</p>
                  <p className={styles.rateValue} style={{ color: rateColor }}>
                    {collectionRate}%
                  </p>
                  <p className={styles.rateSubtitle}>
                    {fmt(stats.totalCollected)} of {fmt(stats.totalExpected)} collected
                  </p>
                </div>
                <div
                  className={styles.rateRing}
                  style={{
                    background: `conic-gradient(${rateColor} ${collectionRate * 3.6}deg, var(--glass-border) 0deg)`,
                  }}
                >
                  <span style={{ color: rateColor }}>{collectionRate}%</span>
                </div>
              </div>
              <div className={styles.rateBar}>
                <div
                  className={styles.rateBarFill}
                  style={{ width: `${collectionRate}%`, background: rateColor }}
                />
              </div>
            </div>

            {/* Stats grid */}
            <div className={styles.statsGrid}>
              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: '#10B98118' }}>
                  <CheckCircleIcon size={16} color="#10B981" />
                </div>
                <p className={styles.statVal}>{stats.fullyPaid}</p>
                <p className={styles.statLbl}>Fully Paid</p>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: '#F5940018' }}>
                  <TrendingUpIcon size={16} color="#F59400" />
                </div>
                <p className={styles.statVal}>{stats.partial}</p>
                <p className={styles.statLbl}>Partial</p>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: '#3B82F618' }}>
                  <UsersIcon size={16} color="#3B82F6" />
                </div>
                <p className={styles.statVal}>{stats.pending}</p>
                <p className={styles.statLbl}>Pending</p>
              </div>
              <div className={styles.statCard}>
                <div className={styles.statIcon} style={{ background: '#EF444418' }}>
                  <AlertCircleIcon size={16} color="#EF4444" />
                </div>
                <p className={styles.statVal}>{stats.overdue}</p>
                <p className={styles.statLbl}>Overdue</p>
              </div>
            </div>

            {/* Balance summary */}
            <div className={styles.balanceCard}>
              <div className={styles.balanceRow}>
                <span>Total Expected</span>
                <strong>{fmt(stats.totalExpected)}</strong>
              </div>
              <div className={styles.balanceRow}>
                <span>Total Collected</span>
                <strong style={{ color: 'var(--success)' }}>{fmt(stats.totalCollected)}</strong>
              </div>
              <div className={styles.balanceDivider} />
              <div className={`${styles.balanceRow} ${styles.balanceTotal}`}>
                <span>Outstanding Balance</span>
                <strong style={{ color: stats.totalBalance > 0 ? 'var(--error)' : 'var(--success)' }}>
                  {fmt(stats.totalBalance)}
                </strong>
              </div>
            </div>
          </>
        )}

        {/* ── BY CLASS ── */}
        {tab === 'classes' && (
          <>
            {classBreakdown.map(cls => (
              <div key={cls.id} className={styles.classCard}>
                <div className={styles.classTop}>
                  <div>
                    <p className={styles.className}>{cls.label}</p>
                    <p className={styles.classCount}>{cls.count} student{cls.count !== 1 ? 's' : ''}</p>
                  </div>
                  <span
                    className={styles.classRate}
                    style={{ color: cls.rate >= 80 ? 'var(--success)' : cls.rate >= 50 ? 'var(--warning)' : 'var(--error)' }}
                  >
                    {cls.rate}%
                  </span>
                </div>
                <div className={styles.classBar}>
                  <div
                    className={styles.classBarFill}
                    style={{
                      width:      `${cls.rate}%`,
                      background: cls.rate >= 80 ? 'var(--success)' : cls.rate >= 50 ? 'var(--warning)' : 'var(--error)',
                    }}
                  />
                </div>
                <div className={styles.classAmounts}>
                  <span>Due: {fmt(cls.due)}</span>
                  <span>Paid: {fmt(cls.paid)}</span>
                  <span>Balance: {fmt(cls.due - cls.paid)}</span>
                </div>
              </div>
            ))}

            {classBreakdown.length === 0 && (
              <div className={styles.empty}>
                <BarChartIcon size={40} color="var(--text-muted)" />
                <p>No fee data available</p>
              </div>
            )}
          </>
        )}

        {/* ── OVERDUE ── */}
        {tab === 'overdue' && (
          <>
            {overdueInvoices.length === 0 ? (
              <div className={styles.empty}>
                <CheckCircleIcon size={40} color="var(--success)" />
                <p style={{ color: 'var(--success)', fontWeight: 700 }}>No overdue payments!</p>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>All students are up to date</p>
              </div>
            ) : (
              overdueInvoices.map((inv: any, i: number) => {
                const student = (inv['profiles!student_id'] as any)
                const sp      = student?.student_profiles as any
                const cls     = sp?.classes as any

                return (
                  <div key={i} className={styles.overdueCard}>
                    <div className={styles.overdueLeft}>
                      <div className={styles.overdueAvatar}>
                        {student?.full_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div>
                        <p className={styles.overdueName}>{student?.full_name ?? 'Unknown'}</p>
                        <p className={styles.overdueClass}>
                          {cls ? `${cls.level} ${cls.section}` : '—'}
                        </p>
                        {inv.due_date && (
                          <p className={styles.overdueDate}>
                            Due: {fmtDate(inv.due_date)}
                          </p>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className={styles.overdueBalance}>{fmt(inv.balance_ngn)}</p>
                      <a
                        href={`/dashboard/bursar/payments/new?student=${student?.id}`}
                        className={styles.overdueBtn}
                      >
                        Pay
                      </a>
                    </div>
                  </div>
                )
              })
            )}
          </>
        )}

        {/* ── RECENT ── */}
        {tab === 'recent' && (
          <>
            {recentPayments.map((p: any) => {
              const student = (p['profiles!student_id'] as any)
              return (
                <div key={p.id} className={styles.recentCard}>
                  <div className={styles.recentIcon}>
                    <CreditCardIcon size={15} color="var(--burgundy)" />
                  </div>
                  <div className={styles.recentInfo}>
                    <p className={styles.recentName}>{student?.full_name ?? 'Student'}</p>
                    <p className={styles.recentReceipt}>#{p.receipt_number} · {fmtDate(p.paid_at)}</p>
                  </div>
                  <p className={styles.recentAmount}>{fmt(p.amount_paid_ngn)}</p>
                </div>
              )
            })}

            {recentPayments.length === 0 && (
              <div className={styles.empty}>
                <CreditCardIcon size={40} color="var(--text-muted)" />
                <p>No payments recorded yet</p>
              </div>
            )}
          </>
        )}

      </div>

      <div style={{ height: '80px' }} />
    </div>
  )
}
