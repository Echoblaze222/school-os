'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { WalletIcon, BarChartIcon, TrendingIcon, SchoolIcon } from '@/components/Icons'
import styles from './revenue.module.css'

export default function RevenuePage() {
  const [payments, setPayments] = useState<any[]>([])
  const [summary,  setSummary]  = useState({ total: 0, thisMonth: 0, lastMonth: 0, schools: 0 })
  const [loading,  setLoading]  = useState(true)
  const [period,   setPeriod]   = useState<'all'|'month'|'year'>('month')
  const supabase = createClient()

  useEffect(() => { load() }, [period])

  async function load() {
    setLoading(true)
    let query = supabase.from('school_payments')
      .select('id, school_id, payment_type, amount_ngn, plan, confirmed_at, schools(name)')
      .order('confirmed_at', { ascending: false })

    if (period === 'month') {
      const start = new Date(); start.setDate(1); start.setHours(0,0,0,0)
      query = query.gte('confirmed_at', start.toISOString())
    } else if (period === 'year') {
      const start = new Date(); start.setMonth(0,1); start.setHours(0,0,0,0)
      query = query.gte('confirmed_at', start.toISOString())
    }

    const { data } = await query.limit(100)
    if (data) {
      setPayments(data)
      const now   = new Date()
      const mStart = new Date(now.getFullYear(), now.getMonth(), 1)
      const lStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lEnd   = new Date(now.getFullYear(), now.getMonth(), 0)

      setSummary({
        total:     data.reduce((s, p) => s + p.amount_ngn, 0),
        thisMonth: data.filter(p => new Date(p.confirmed_at) >= mStart).reduce((s,p) => s + p.amount_ngn, 0),
        lastMonth: data.filter(p => { const d = new Date(p.confirmed_at); return d >= lStart && d <= lEnd }).reduce((s,p) => s + p.amount_ngn, 0),
        schools:   new Set(data.map(p => p.school_id)).size,
      })
    }
    setLoading(false)
  }

  const TYPE_LABELS: Record<string, string> = {
    setup: '🏗️ Setup', subscription: '📅 Subscription', installment: '📦 Installment',
  }
  const PLAN_LABELS: Record<string, string> = {
    basic_500: 'Basic', standard_1000: 'Standard', premium_2000: 'Premium',
    installment_3month: 'Installment', free_month: 'Free Month',
  }

  function formatNGN(n: number) {
    return n >= 1000000 ? `₦${(n/1000000).toFixed(1)}M` : n >= 1000 ? `₦${(n/1000).toFixed(0)}k` : `₦${n}`
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Revenue Dashboard</h1>
          <p className={styles.sub}>Track all school payments and income</p>
        </div>
        <div className={styles.periodTabs}>
          {([['all','All Time'],['month','This Month'],['year','This Year']] as const).map(([v,l]) => (
            <button key={v} onClick={() => setPeriod(v)}
              className={`${styles.periodBtn} ${period===v ? styles.periodActive : ''}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className={styles.statsGrid}>
        {[
          { label:'Total Revenue',   value: formatNGN(summary.total),     color:'#10B981', Icon: WalletIcon   },
          { label:'This Month',      value: formatNGN(summary.thisMonth),  color:'#7C3AED', Icon: BarChartIcon },
          { label:'Last Month',      value: formatNGN(summary.lastMonth),  color:'#3B82F6', Icon: BarChartIcon },
          { label:'Paying Schools',  value: summary.schools,               color:'#F59E0B', Icon: SchoolIcon   },
        ].map(s => (
          <div key={s.label} className={styles.statCard}>
            <div className={styles.statIcon} style={{ background: s.color + '20' }}>
              <s.Icon size={20} color={s.color}/>
            </div>
            <div>
              <p className={styles.statVal}>{s.value}</p>
              <p className={styles.statLbl}>{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Payments table */}
      {loading ? <div className={styles.loading}><span/><span/><span/></div>
      : payments.length === 0
        ? <div className={styles.empty}><WalletIcon size={40} color="var(--text-faint)" strokeWidth={1}/><p>No payments in this period</p></div>
        : <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.th}>School</th>
                  <th className={styles.th}>Type</th>
                  <th className={styles.th}>Plan</th>
                  <th className={styles.th}>Amount</th>
                  <th className={styles.th}>Date</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id} className={styles.tr}>
                    <td className={styles.td}>{(p.schools as any)?.name ?? '—'}</td>
                    <td className={styles.td}>{TYPE_LABELS[p.payment_type] ?? p.payment_type}</td>
                    <td className={styles.td}>{p.plan ? PLAN_LABELS[p.plan] ?? p.plan : '—'}</td>
                    <td className={styles.td}>
                      <span style={{ fontWeight:700, color:'#10B981' }}>₦{Number(p.amount_ngn).toLocaleString()}</span>
                    </td>
                    <td className={styles.td} style={{ color:'var(--text-muted)', fontSize:'0.78rem' }}>
                      {new Date(p.confirmed_at).toLocaleDateString('en-NG',{day:'numeric',month:'short',year:'numeric'})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      }
    </div>
  )
}
