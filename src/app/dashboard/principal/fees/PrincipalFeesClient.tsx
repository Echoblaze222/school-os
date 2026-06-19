'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  BarChartIcon, CreditCardIcon, AlertCircleIcon, UsersIcon,
  ArrowLeftIcon, SunIcon, MoonIcon, TrendingUpIcon, CheckCircleIcon,
} from '@/components/Icons'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'
import styles from './fees.module.css'

const OVERLAY: React.CSSProperties = {
  position: 'fixed', inset: 0, zIndex: 200,
  background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
  display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
}
const SHEET: React.CSSProperties = {
  width: '100%', maxWidth: 520,
  background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
  borderRadius: '18px 18px 0 0', padding: '20px 20px 36px',
  maxHeight: '80vh', overflowY: 'auto',
}

export default function PrincipalFeesClient({
  stats, classFees, recentPayments, overdueInvoices, schoolId,
  currentTerm, currentYear,
}: any) {
  const router = useRouter()
  const [tab,   setTab]   = useState<'overview' | 'classes' | 'overdue' | 'recent'>('overview')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [yearInput, setYearInput] = useState(currentYear)

  const TERM_OPTIONS = [
    { key: 'first',  label: 'First' },
    { key: 'second', label: 'Second' },
    { key: 'third',  label: 'Third' },
  ]

  function goToTermYear(term: string, year: string) {
    const params = new URLSearchParams({ term, year })
    router.push(`/dashboard/principal/fees?${params.toString()}`)
  }

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

  const [previewItem, setPreviewItem] = useState<any | null>(null)
  const [previewType, setPreviewType] = useState<'overdue' | 'recent' | null>(null)

  function openOverduePreview(inv: any) { setPreviewItem(inv); setPreviewType('overdue') }
  function openRecentPreview(p: any)   { setPreviewItem(p);   setPreviewType('recent') }
  function closeItemPreview()          { setPreviewItem(null); setPreviewType(null) }

  const collectionRate = stats.totalExpected > 0
    ? Math.round((stats.totalCollected / stats.totalExpected) * 100)
    : 0

  // Group class fees — uses profiles.class_level directly (the column every
  // other page in this app already relies on). The original version tried
  // to go through student.student_profiles.classes, but student_profiles.id
  // has no foreign key to profiles.id in the schema, so that nested embed
  // would have failed with a "could not find relationship" error.
  const classBreakdown = useMemo(() => {
    const map: Record<string, { due: number; paid: number; count: number; label: string }> = {}

    classFees.forEach((inv: any) => {
      const student = unwrapEmbed(inv['profiles!student_id']) as any
      const label   = student?.class_level || 'Unassigned'
      const key     = label

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

      {/* ── Item Preview Modal ── */}
      {previewItem && previewType && (() => {
        if (previewType === 'overdue') {
          const student = unwrapEmbed(previewItem['profiles!student_id']) as any
          return (
            <div style={OVERLAY} onClick={closeItemPreview}>
              <div style={SHEET} onClick={e => e.stopPropagation()}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)', margin: '0 auto 18px' }} />
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: '#EF4444', letterSpacing: '0.07em', margin: '0 0 10px' }}>⚠️ OVERDUE INVOICE</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#EF444420', border: '1px solid #EF444440', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1rem', color: '#EF4444', flexShrink: 0 }}>
                    {student?.full_name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <div>
                    <p style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>{student?.full_name ?? 'Unknown'}</p>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{student?.class_level || '—'}</p>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {[
                    { label: 'Balance Due', val: fmt(previewItem.balance_ngn), color: 'var(--error)' },
                    { label: 'Amount Due',  val: fmt(previewItem.amount_due_ngn), color: 'var(--text-primary)' },
                    { label: 'Amount Paid', val: fmt(previewItem.amount_paid_ngn), color: 'var(--success)' },
                    { label: 'Due Date',    val: previewItem.due_date ? fmtDate(previewItem.due_date) : '—', color: 'var(--text-muted)' },
                  ].map(({ label, val, color }) => (
                    <div key={label} style={{ background: 'var(--input-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, padding: '10px 12px' }}>
                      <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em', margin: '0 0 4px' }}>{label.toUpperCase()}</p>
                      <p style={{ fontSize: '0.92rem', fontWeight: 800, color, margin: 0 }}>{val}</p>
                    </div>
                  ))}
                </div>
                <a
                  href={`/dashboard/bursar/record-payment?invoice=${previewItem.id}&student=${encodeURIComponent(student?.full_name ?? '')}`}
                  style={{ display: 'block', width: '100%', height: 44, background: '#EF4444', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', textAlign: 'center', lineHeight: '44px', textDecoration: 'none', boxSizing: 'border-box' }}>
                  💳 Record Payment
                </a>
              </div>
            </div>
          )
        }

        if (previewType === 'recent') {
          const student = unwrapEmbed(previewItem['profiles!student_id']) as any
          const amount  = previewItem.currency_used === 'USD' ? previewItem.amount_paid_usd : previewItem.amount_paid_ngn
          const display = previewItem.currency_used === 'USD'
            ? `$${(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
            : fmt(amount ?? 0)
          return (
            <div style={OVERLAY} onClick={closeItemPreview}>
              <div style={SHEET} onClick={e => e.stopPropagation()}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)', margin: '0 auto 18px' }} />
                <p style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.07em', margin: '0 0 10px' }}>💳 PAYMENT RECEIPT</p>
                <div style={{ textAlign: 'center', marginBottom: 20 }}>
                  <p style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--success)', margin: 0 }}>{display}</p>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>#{previewItem.receipt_number}</p>
                </div>
                {[
                  { label: 'Student',  val: student?.full_name ?? '—' },
                  { label: 'Class',    val: student?.class_level ?? '—' },
                  { label: 'Currency', val: previewItem.currency_used ?? 'NGN' },
                  { label: 'Date',     val: fmtDate(previewItem.paid_at) },
                ].map(({ label, val }) => (
                  <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--glass-border)' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
                    <span style={{ fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 700 }}>{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        }
        return null
      })()}

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/principal')}>
          <ArrowLeftIcon size={18} />
        </button>
        <h1 className={styles.headerTitle}>Fee Overview</h1>
        <button className={styles.iconBtn} onClick={toggleTheme}>
          {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
        </button>
      </header>

      {/* Term/Year picker — without this, the dashboard silently guessed
          the term from today's calendar date with no way to correct it,
          which is exactly what caused it to show all zeros when the
          school's actual term didn't match that guess. */}
      <div style={{ display: 'flex', gap: 10, padding: '0 16px 12px', alignItems: 'center' }}>
        <input
          value={yearInput}
          onChange={e => setYearInput(e.target.value)}
          onBlur={() => { if (yearInput && yearInput !== currentYear) goToTermYear(currentTerm, yearInput) }}
          onKeyDown={e => { if (e.key === 'Enter') goToTermYear(currentTerm, yearInput) }}
          placeholder="2025/2026"
          style={{
            height: 38, width: 108, flexShrink: 0, padding: '0 10px',
            background: 'var(--input-bg)', border: '1px solid var(--input-border)',
            borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none',
          }}
        />
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          {TERM_OPTIONS.map(t => (
            <button
              key={t.key}
              onClick={() => goToTermYear(t.key, yearInput || currentYear)}
              style={{
                flex: 1, height: 38, borderRadius: 8, fontWeight: 700, fontSize: '0.78rem',
                cursor: 'pointer', transition: 'all 0.15s',
                border: `1px solid ${currentTerm === t.key ? 'var(--burgundy)' : 'var(--input-border)'}`,
                background: currentTerm === t.key ? 'var(--burgundy)' : 'var(--input-bg)',
                color: currentTerm === t.key ? '#fff' : 'var(--text-muted)',
              }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

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
                const student = unwrapEmbed(inv['profiles!student_id']) as any

                return (
                  <div key={i} className={styles.overdueCard} onClick={() => openOverduePreview(inv)} style={{ cursor: 'pointer' }}>
                    <div className={styles.overdueLeft}>
                      <div className={styles.overdueAvatar}>
                        {student?.full_name?.[0]?.toUpperCase() ?? '?'}
                      </div>
                      <div>
                        <p className={styles.overdueName}>{student?.full_name ?? 'Unknown'}</p>
                        <p className={styles.overdueClass}>
                          {student?.class_level || '—'}
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
              const student = unwrapEmbed(p['profiles!student_id']) as any
              const amount  = p.currency_used === 'USD' ? p.amount_paid_usd : p.amount_paid_ngn
              const display = p.currency_used === 'USD'
                ? `$${(amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                : fmt(amount ?? 0)
              return (
                <div key={p.id} className={styles.recentCard} onClick={() => openRecentPreview(p)} style={{ cursor: 'pointer' }}>
                  <div className={styles.recentIcon}>
                    <CreditCardIcon size={15} color="var(--burgundy)" />
                  </div>
                  <div className={styles.recentInfo}>
                    <p className={styles.recentName}>{student?.full_name ?? 'Student'}</p>
                    <p className={styles.recentReceipt}>#{p.receipt_number} · {fmtDate(p.paid_at)}</p>
                  </div>
                  <p className={styles.recentAmount}>{display}</p>
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
