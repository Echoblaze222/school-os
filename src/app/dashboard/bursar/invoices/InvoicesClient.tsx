'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import styles from './invoices.module.css'

const TERMS = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`
  : `${new Date().getFullYear() - 1}/${new Date().getFullYear()}`

const STATUS_COLORS: Record<string, string> = {
  completed: 'badge-success',
  partial:   'badge-warning',
  pending:   'badge-info',
  overdue:   'badge-error',
}
const STATUS_EMOJIS: Record<string, string> = {
  completed: '✅',
  partial:   '⏳',
  pending:   '🕐',
  overdue:   '⚠️',
}

export default function InvoicesClient({ invoices: initialInvoices, schoolId }: any) {
  const router = useRouter()
  const [invoices,      setInvoices]      = useState<any[]>(initialInvoices)
  const [statusFilter,  setStatusFilter]  = useState('all')
  const [termFilter,    setTermFilter]    = useState('all')
  const [search,        setSearch]        = useState('')
  const [theme,         setTheme]         = useState<'dark' | 'light'>('dark')

  // Generate invoices state
  const [genTerm,       setGenTerm]       = useState('First Term')
  const [genYear,       setGenYear]       = useState(CUR_YEAR)
  const [generating,    setGenerating]    = useState(false)
  const [genResult,     setGenResult]     = useState<{ ok: boolean; msg: string } | null>(null)
  const [showGenPanel,  setShowGenPanel]  = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  const filtered = useMemo(() => {
    return invoices.filter((inv: any) => {
      const student = inv['profiles!student_id'] as any
      const name    = student?.full_name?.toLowerCase() ?? ''
      const admNo   = student?.permanent_student_id?.toLowerCase() ?? ''
      const invTerm = inv.fee_structures?.term ?? ''

      const matchSearch = !search ||
        name.includes(search.toLowerCase()) ||
        admNo.includes(search.toLowerCase())
      const matchStatus = statusFilter === 'all' || inv.status === statusFilter
      const matchTerm   = termFilter === 'all' || invTerm === termFilter

      return matchSearch && matchStatus && matchTerm
    })
  }, [invoices, search, statusFilter, termFilter])

  const stats = useMemo(() => ({
    totalDue:     filtered.reduce((s: number, i: any) => s + (i.amount_due_ngn || 0), 0),
    totalPaid:    filtered.reduce((s: number, i: any) => s + (i.amount_paid_ngn || 0), 0),
    totalBalance: filtered.reduce((s: number, i: any) => s + (i.balance_ngn || 0), 0),
    overdue:      filtered.filter((i: any) => i.status === 'overdue').length,
  }), [filtered])

  function fmt(n: number) { return `₦${(n || 0).toLocaleString()}` }
  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  async function generateInvoices() {
    setGenerating(true)
    setGenResult(null)
    try {
      const res = await fetch('/api/bursar/generate-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term: genTerm, academic_year: genYear }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGenResult({ ok: false, msg: data.error || 'Failed to generate invoices.' })
      } else {
        setGenResult({ ok: true, msg: data.message })
        // Refresh page to reload invoices from server
        setTimeout(() => router.refresh(), 1500)
      }
    } catch {
      setGenResult({ ok: false, msg: 'Network error. Please try again.' })
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/bursar')}>←</button>
        <h1 className={styles.headerTitle}>Invoices</h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className={styles.iconBtn}
            onClick={() => { setShowGenPanel(p => !p); setGenResult(null) }}
            title="Generate invoices from fee structures"
            style={{ fontSize: '1.1rem' }}>
            ⚡
          </button>
          <button className={styles.iconBtn} onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark'
            setTheme(next)
            localStorage.setItem('schoolos_theme', next)
            document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
          }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* ── Generate Invoices Panel ── */}
      {showGenPanel && (
        <div style={{
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          borderRadius: 12, padding: '16px', marginBottom: 16,
        }}>
          <p style={{ fontSize: '0.82rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 12px' }}>
            ⚡ Generate Invoices from Fee Structures
          </p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0 0 12px', lineHeight: 1.5 }}>
            This creates invoices for all active students based on the fee structures you've set up.
            Safe to run multiple times — existing invoices are not duplicated.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <input
              value={genYear}
              onChange={e => setGenYear(e.target.value)}
              placeholder="2025/2026"
              style={{
                height: 40, padding: '0 12px', background: 'var(--input-bg)',
                border: '1px solid var(--input-border)', borderRadius: 8,
                color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none',
              }}
            />
            <select
              value={genTerm}
              onChange={e => setGenTerm(e.target.value)}
              style={{
                height: 40, padding: '0 12px', background: 'var(--input-bg)',
                border: '1px solid var(--input-border)', borderRadius: 8,
                color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none',
              }}>
              {TERMS.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          {genResult && (
            <div style={{
              padding: '10px 14px', marginBottom: 12,
              background: genResult.ok ? '#10B98115' : '#EF444415',
              border: `1px solid ${genResult.ok ? '#10B98140' : '#EF444440'}`,
              borderRadius: 8, fontSize: '0.8rem', fontWeight: 600,
              color: genResult.ok ? '#10B981' : '#EF4444',
            }}>
              {genResult.ok ? '✓' : '⚠️'} {genResult.msg}
            </div>
          )}

          <button
            onClick={generateInvoices}
            disabled={generating}
            style={{
              width: '100%', height: 40, background: '#7C3AED',
              color: '#fff', border: 'none', borderRadius: 8,
              fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
              opacity: generating ? 0.6 : 1,
            }}>
            {generating ? 'Generating…' : `Generate Invoices — ${genTerm} ${genYear}`}
          </button>
        </div>
      )}

      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={`glass-card ${styles.statCard}`}>
          <span className={styles.statEmoji}>📋</span>
          <p className={styles.statValue}>{fmt(stats.totalDue)}</p>
          <p className={styles.statLabel}>Total Due</p>
        </div>
        <div className={`glass-card ${styles.statCard}`}>
          <span className={styles.statEmoji}>✅</span>
          <p className={styles.statValue}>{fmt(stats.totalPaid)}</p>
          <p className={styles.statLabel}>Collected</p>
        </div>
        <div className={`glass-card ${styles.statCard}`}>
          <span className={styles.statEmoji}>⚠️</span>
          <p className={styles.statValue}>{stats.overdue}</p>
          <p className={styles.statLabel}>Overdue</p>
        </div>
      </div>

      {/* Balance card */}
      <div className={`glass-card ${styles.balanceCard}`}>
        <p className={styles.balanceLabel}>💰 Outstanding Balance</p>
        <p className={styles.balanceAmount}>{fmt(stats.totalBalance)}</p>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchBar}>
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search student name or ID..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>
        <div className={styles.filterRow}>
          <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Status</option>
            <option value="completed">✅ Paid</option>
            <option value="partial">⏳ Partial</option>
            <option value="pending">🕐 Pending</option>
            <option value="overdue">⚠️ Overdue</option>
          </select>
          <select className={styles.filterSelect} value={termFilter} onChange={e => setTermFilter(e.target.value)}>
            <option value="all">All Terms</option>
            <option value="first">First Term</option>
            <option value="second">Second Term</option>
            <option value="third">Third Term</option>
          </select>
        </div>
      </div>

      {/* Invoice list */}
      <div className={styles.invoiceList}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyEmoji}>🧾</p>
            <p className={styles.emptyTitle}>No invoices found</p>
            <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
              Tap ⚡ above to generate invoices from your fee structures,{'\n'}
              or create fee structures first under Fee Records.
            </p>
          </div>
        ) : (
          filtered.map((inv: any) => {
            const student = inv['profiles!student_id'] as any
            const fee     = inv.fee_structures as any

            return (
              <div key={inv.id} className={`glass-card ${styles.invoiceCard}`}>
                <div className={styles.invoiceTop}>
                  <div>
                    <p className={styles.studentName}>{student?.full_name ?? 'Unknown'}</p>
                    <p className={styles.studentMeta}>
                      {student?.permanent_student_id ?? student?.admission_number ?? '—'}
                      {student?.class_level ? ` · ${student.class_level}` : ''}
                    </p>
                  </div>
                  <span className={`badge ${STATUS_COLORS[inv.status] ?? 'badge-info'}`}>
                    {STATUS_EMOJIS[inv.status] ?? '🕐'} {inv.status}
                  </span>
                </div>

                <p className={styles.feeDesc}>{fee?.description ?? 'School Fees'}</p>
                <p className={styles.feeTerm}>
                  {fee?.term
                    ? fee.term.charAt(0).toUpperCase() + fee.term.slice(1) + ' Term'
                    : ''}
                  {fee?.academic_year ? ` · ${fee.academic_year}` : ''}
                </p>

                <div className={styles.invoiceAmounts}>
                  <div className={styles.amountCol}>
                    <p className={styles.amountLabel}>Due</p>
                    <p className={styles.amountVal}>{fmt(inv.amount_due_ngn)}</p>
                  </div>
                  <div className={styles.amountCol}>
                    <p className={styles.amountLabel}>Paid</p>
                    <p className={`${styles.amountVal} ${styles.paidAmt}`}>{fmt(inv.amount_paid_ngn)}</p>
                  </div>
                  <div className={styles.amountCol}>
                    <p className={styles.amountLabel}>Balance</p>
                    <p className={`${styles.amountVal} ${inv.balance_ngn > 0 ? styles.balanceAmt : styles.paidAmt}`}>
                      {fmt(inv.balance_ngn)}
                    </p>
                  </div>
                </div>

                {inv.due_date && (
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '6px 0 0' }}>
                    Due: {fmtDate(inv.due_date)}
                  </p>
                )}

                {inv.balance_ngn > 0 && (
                  <a
                    href={`/dashboard/bursar/record-payment?invoice=${inv.id}&student=${student?.full_name ?? ''}`}
                    className={`btn btn-primary ${styles.recordBtn}`}>
                    💳 Record Payment
                  </a>
                )}
              </div>
            )
          })
        )}
      </div>

      <div style={{ height: '100px' }} />
    </div>
  )
}
