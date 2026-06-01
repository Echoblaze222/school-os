'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import styles from './payments.module.css'

interface Payment {
  id: string
  amount_paid_ngn: number
  amount_paid_usd: number | null
  currency_used: string
  payment_method: string | null
  payment_reference: string | null
  receipt_number: string | null
  paid_at: string
  profiles_student: { full_name: string; permanent_student_id: string | null } | null
  profiles_bursar: { full_name: string } | null
}

interface Props {
  payments: any[]
  schoolId: string
  userId: string
}

const METHOD_ICONS: Record<string, string> = {
  cash:          '💵',
  bank_transfer: '🏦',
  card:          '💳',
  online:        '📱',
}

export default function AllPaymentsClient({ payments, schoolId, userId }: Props) {
  const router = useRouter()
  const [search,      setSearch]      = useState('')
  const [methodFilter,setMethodFilter]= useState('all')
  const [dateFrom,    setDateFrom]    = useState('')
  const [dateTo,      setDateTo]      = useState('')
  const [theme,       setTheme]       = useState<'dark' | 'light'>('dark')

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

  // Filter payments
  const filtered = useMemo(() => {
    return payments.filter(p => {
      const student = (p['profiles!student_id'] as any)
      const name  = student?.full_name?.toLowerCase() ?? ''
      const admNo = student?.permanent_student_id?.toLowerCase() ?? ''
      const rcpt  = p.receipt_number?.toLowerCase() ?? ''

      const matchSearch = !search ||
        name.includes(search.toLowerCase()) ||
        admNo.includes(search.toLowerCase()) ||
        rcpt.includes(search.toLowerCase())

      const matchMethod = methodFilter === 'all' || p.payment_method === methodFilter

      const payDate = new Date(p.paid_at)
      const matchFrom = !dateFrom || payDate >= new Date(dateFrom)
      const matchTo   = !dateTo   || payDate <= new Date(dateTo + 'T23:59:59')

      return matchSearch && matchMethod && matchFrom && matchTo
    })
  }, [payments, search, methodFilter, dateFrom, dateTo])

  // Totals
  const totalNGN = filtered.reduce((s, p) => s + (p.amount_paid_ngn || 0), 0)

  // Export as CSV
  function exportCSV() {
    const headers = ['Receipt No', 'Student Name', 'Admission No', 'Amount (NGN)', 'Method', 'Date', 'Reference', 'Received By']
    const rows = filtered.map(p => {
      const student = (p['profiles!student_id'] as any)
      const bursar  = (p['profiles!received_by'] as any)
      return [
        p.receipt_number ?? '',
        student?.full_name ?? '',
        student?.permanent_student_id ?? '',
        p.amount_paid_ngn ?? 0,
        p.payment_method ?? '',
        new Date(p.paid_at).toLocaleDateString(),
        p.payment_reference ?? '',
        bursar?.full_name ?? '',
      ]
    })

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `payments_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function formatAmount(ngn: number) {
    return `₦${ngn.toLocaleString()}`
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/bursar')}>←</button>
        <h1 className={styles.headerTitle}>All Payments</h1>
        <div className={styles.headerRight}>
          <button className={styles.iconBtn} onClick={toggleTheme}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button className={styles.exportBtn} onClick={exportCSV}>
            📥 CSV
          </button>
        </div>
      </header>

      {/* Summary bar */}
      <div className={styles.summaryBar}>
        <div className={styles.summaryItem}>
          <span className={styles.summaryEmoji}>💰</span>
          <div>
            <p className={styles.summaryValue}>{formatAmount(totalNGN)}</p>
            <p className={styles.summaryLabel}>Total Shown</p>
          </div>
        </div>
        <div className={styles.summaryItem}>
          <span className={styles.summaryEmoji}>📄</span>
          <div>
            <p className={styles.summaryValue}>{filtered.length}</p>
            <p className={styles.summaryLabel}>Payments</p>
          </div>
        </div>
        <a href="/dashboard/bursar/payments/new" className={`btn btn-primary ${styles.newPaymentBtn}`}>
          + Record
        </a>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.searchBar}>
          <span>🔍</span>
          <input
            type="text"
            placeholder="Search student, receipt..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={styles.searchInput}
          />
        </div>

        <div className={styles.filterRow}>
          <select
            className={styles.filterSelect}
            value={methodFilter}
            onChange={e => setMethodFilter(e.target.value)}
          >
            <option value="all">All Methods</option>
            <option value="cash">💵 Cash</option>
            <option value="bank_transfer">🏦 Bank Transfer</option>
            <option value="card">💳 Card</option>
            <option value="online">📱 Online</option>
          </select>

          <input
            type="date"
            className={styles.filterSelect}
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            title="From date"
          />

          <input
            type="date"
            className={styles.filterSelect}
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            title="To date"
          />

          {(search || methodFilter !== 'all' || dateFrom || dateTo) && (
            <button
              className={styles.clearBtn}
              onClick={() => { setSearch(''); setMethodFilter('all'); setDateFrom(''); setDateTo('') }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Payments list */}
      <div className={styles.paymentsList}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyEmoji}>💳</p>
            <p className={styles.emptyTitle}>No payments found</p>
            <p className={styles.emptyHint}>Try adjusting your filters</p>
          </div>
        ) : (
          filtered.map(payment => {
            const student = (payment['profiles!student_id'] as any)
            const bursar  = (payment['profiles!received_by'] as any)
            const method  = payment.payment_method ?? 'cash'

            return (
              <div key={payment.id} className={`glass-card ${styles.paymentCard}`}>
                <div className={styles.cardLeft}>
                  <div className={styles.methodIcon}>
                    {METHOD_ICONS[method] ?? '💳'}
                  </div>
                  <div className={styles.paymentInfo}>
                    <p className={styles.studentName}>
                      {student?.full_name ?? 'Unknown Student'}
                    </p>
                    <p className={styles.admNo}>
                      {student?.permanent_student_id ?? '—'}
                    </p>
                    <p className={styles.receiptNo}>
                      🧾 {payment.receipt_number ?? 'No receipt'}
                    </p>
                  </div>
                </div>

                <div className={styles.cardRight}>
                  <p className={styles.amount}>
                    {formatAmount(payment.amount_paid_ngn)}
                  </p>
                  <p className={styles.payDate}>{formatDate(payment.paid_at)}</p>
                  {payment.payment_reference && (
                    <p className={styles.reference}>Ref: {payment.payment_reference}</p>
                  )}
                  <p className={styles.receivedBy}>
                    by {bursar?.full_name ?? '—'}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      <div style={{ height: '100px' }} />

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <a href="/dashboard/bursar/payments/new" className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>💳</span>
          <span>Record</span>
        </a>
        <a href="/dashboard/bursar/payments" className="nav-item active">
          <span style={{ fontSize: '1.2rem' }}>📄</span>
          <span>Payments</span>
        </a>
        <a href="/dashboard/bursar" className="nav-home">
          <span style={{ fontSize: '1.3rem' }}>🏠</span>
        </a>
        <a href="/dashboard/bursar/reminders" className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>📲</span>
          <span>Reminders</span>
        </a>
        <a href="/dashboard/bursar/ai" className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>🤖</span>
          <span>AI</span>
        </a>
      </nav>
    </div>
  )
}
