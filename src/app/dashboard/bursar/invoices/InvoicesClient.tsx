'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import styles from './invoices.module.css'

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

export default function InvoicesClient({ invoices, schoolId }: any) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('all')
  const [termFilter,   setTermFilter]   = useState('all')
  const [search,       setSearch]       = useState('')
  const [theme,        setTheme]        = useState<'dark' | 'light'>('dark')

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
      const term    = inv.fee_structures?.term ?? ''

      const matchSearch = !search || name.includes(search.toLowerCase()) || admNo.includes(search.toLowerCase())
      const matchStatus = statusFilter === 'all' || inv.status === statusFilter
      const matchTerm   = termFilter   === 'all' || term === termFilter

      return matchSearch && matchStatus && matchTerm
    })
  }, [invoices, search, statusFilter, termFilter])

  const stats = useMemo(() => ({
    totalDue:       filtered.reduce((s: number, i: any) => s + (i.amount_due_ngn || 0), 0),
    totalPaid:      filtered.reduce((s: number, i: any) => s + (i.amount_paid_ngn || 0), 0),
    totalBalance:   filtered.reduce((s: number, i: any) => s + (i.balance_ngn || 0), 0),
    overdue:        filtered.filter((i: any) => i.status === 'overdue').length,
  }), [filtered])

  function fmt(n: number) { return `₦${n.toLocaleString()}` }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
  }

  return (
    <div className={styles.page}>

      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/bursar')}>←</button>
        <h1 className={styles.headerTitle}>Invoices</h1>
        <button className={styles.iconBtn} onClick={() => {
          const next = theme === 'dark' ? 'light' : 'dark'
          setTheme(next); localStorage.setItem('schoolos_theme', next)
          document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
        }}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

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
          </div>
        ) : (
          filtered.map((inv: any) => {
            const student = inv['profiles!student_id'] as any
            const sp      = student?.student_profiles as any
            const cls     = sp?.classes as any
            const fee     = inv.fee_structures as any

            return (
              <div key={inv.id} className={`glass-card ${styles.invoiceCard}`}>
                <div className={styles.invoiceTop}>
                  <div>
                    <p className={styles.studentName}>{student?.full_name ?? 'Unknown'}</p>
                    <p className={styles.studentMeta}>
                      {student?.permanent_student_id ?? '—'}
                      {cls ? ` · ${cls.level} ${cls.section}` : ''}
                    </p>
                  </div>
                  <span className={`badge ${STATUS_COLORS[inv.status] ?? 'badge-info'}`}>
                    {STATUS_EMOJIS[inv.status]} {inv.status}
                  </span>
                </div>

                <p className={styles.feeDesc}>{fee?.description ?? 'School Fees'}</p>
                <p className={styles.feeTerm}>
                  {fee?.term ? `${fee.term.charAt(0).toUpperCase() + fee.term.slice(1)} Term` : ''}
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

                {inv.balance_ngn > 0 && (
                  <a
                    href={`/dashboard/bursar/payments/new?invoice=${inv.id}`}
                    className={`btn btn-primary ${styles.recordBtn}`}
                  >
                    💳 Record Payment
                  </a>
                )}
              </div>
            )
          })
        )}
      </div>

      <div style={{ height: '100px' }} />

      <nav className="bottom-nav">
        <a href="/dashboard/bursar/payments/new" className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>💳</span><span>Record</span>
        </a>
        <a href="/dashboard/bursar/payments" className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>📄</span><span>Payments</span>
        </a>
        <a href="/dashboard/bursar" className="nav-home">
          <span style={{ fontSize: '1.3rem' }}>🏠</span>
        </a>
        <a href="/dashboard/bursar/invoices" className="nav-item active">
          <span style={{ fontSize: '1.2rem' }}>🧾</span><span>Invoices</span>
        </a>
        <a href="/dashboard/bursar/ai" className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>🤖</span><span>AI</span>
        </a>
      </nav>
    </div>
  )
}
