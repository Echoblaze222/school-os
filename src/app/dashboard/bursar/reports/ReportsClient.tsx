'use client'
// src/app/dashboard/bursar/reports/ReportsClient.tsx
//
// Fixed: was reading from `school_fees` and `fee_payments`, tables nothing
// writes to anymore. Now reads from `payment_invoices` (for expected/collected
// per class, paid/unpaid counts) and `payments` (for the By Type breakdown,
// since fee type lives on fee_structures.description, reached via
// payment_invoices -> fee_structures).

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BarChartIcon } from '@/components/Icons'
import { unwrapEmbed } from '@/lib/utils/unwrapEmbed'
import styles from '@/app/dashboard/student/records/page.module.css'

type Tab = 'summary' | 'by_class' | 'by_type'
interface Props { profile: any; school: any; userId: string }

const TERMS    = ['First Term', 'Second Term', 'Third Term']
const CUR_YEAR = new Date().getMonth() >= 8
  ? `${new Date().getFullYear()}/${new Date().getFullYear()+1}`
  : `${new Date().getFullYear()-1}/${new Date().getFullYear()}`

const TERM_KEY_MAP: Record<string, string> = {
  'First Term': 'first', 'Second Term': 'second', 'Third Term': 'third',
}

function currentTerm() {
  const m = new Date().getMonth()
  if (m >= 8) return 'First Term'
  if (m <= 2) return 'Second Term'
  return 'Third Term'
}

const TYPE_LABELS: Record<string, string> = {
  school_fees:'School Fees', development_levy:'Dev. Levy',
  pta:'PTA', uniform:'Uniform', other:'Other',
}

export default function ReportsClient({ profile, school, userId }: Props) {
  const [tab,     setTab]     = useState<Tab>('summary')
  const [report,  setReport]  = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')
  const [term,    setTerm]    = useState(currentTerm())
  const [year,    setYear]    = useState(CUR_YEAR)
  const supabase = createClient()
  const sc       = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [term, year])

  async function load() {
    setLoading(true)
    setError('')
    const termKey = TERM_KEY_MAP[term] ?? 'first'

    const [{ data: invoices, error: invErr }, { data: studs, error: studErr }] = await Promise.all([
      supabase
        .from('payment_invoices')
        .select(`
          student_id, amount_due_ngn, amount_paid_ngn, status,
          fee_structures ( term, academic_year, description ),
          profiles ( class_level )
        `)
        .eq('school_id', school?.id),
      supabase
        .from('profiles')
        .select('id, class_level')
        .eq('school_id', school?.id)
        .eq('role', 'student'),
    ])

    if (invErr || studErr) {
      setError((invErr ?? studErr)?.message ?? 'Failed to load report data.')
      setLoading(false)
      return
    }

    const studList = studs ?? []

    // Filter to the selected term/year client-side — embeds can come back
    // as object OR 1-element array, and PostgREST doesn't reliably apply
    // filters on a 2nd-level nested embed, so we verify here instead.
    const termInvoices = (invoices ?? []).filter((inv: any) => {
      const fs = unwrapEmbed(inv.fee_structures)
      return fs && fs.term === termKey && fs.academic_year === year
    })

    const totalCollected = termInvoices.reduce((s: number, i: any) => s + (i.amount_paid_ngn ?? 0), 0)
    const totalExpected  = termInvoices.reduce((s: number, i: any) => s + (i.amount_due_ngn  ?? 0), 0)
    const paidIds         = new Set(
      termInvoices.filter((i: any) => (i.amount_paid_ngn ?? 0) > 0).map((i: any) => i.student_id)
    )
    const paidCount      = paidIds.size
    const unpaidCount    = Math.max(0, studList.length - paidCount)

    // Collected + expected by class
    const byClass: Record<string, { collected:number; expected:number }> = {}
    for (const inv of termInvoices) {
      const student = unwrapEmbed((inv as any).profiles)
      const cl = student?.class_level ?? 'Unassigned'
      if (!byClass[cl]) byClass[cl] = { collected:0, expected:0 }
      byClass[cl].collected += inv.amount_paid_ngn ?? 0
      byClass[cl].expected  += inv.amount_due_ngn  ?? 0
    }

    // Collected by fee type — fee type lives on fee_structures.description
    // (e.g. 'school_fees', 'other', 'uniform'), not on payments directly.
    const byType: Record<string, number> = {}
    for (const inv of termInvoices) {
      const fs = unwrapEmbed((inv as any).fee_structures)
      const ft = fs?.description ?? 'other'
      byType[ft] = (byType[ft] ?? 0) + (inv.amount_paid_ngn ?? 0)
    }

    setReport({
      totalCollected, totalExpected, paidCount, unpaidCount,
      studentCount: studList.length, byClass, byType,
    })
    setLoading(false)
  }

  function fmtAmt(n: number) {
    return new Intl.NumberFormat('en-NG', {
      style:'currency', currency:'NGN', minimumFractionDigits:0
    }).format(n)
  }

  function Bar({ value, max, color = sc }: { value:number; max:number; color?:string }) {
    const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0
    return (
      <div>
        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
          <span style={{ fontSize:'0.72rem', color:'var(--text-muted)' }}>{fmtAmt(value)}</span>
          <span style={{ fontSize:'0.72rem', fontWeight:700, color }}>
            {pct}%
          </span>
        </div>
        <div style={{ height:6, background:'var(--glass-border)', borderRadius:3 }}>
          <div style={{ height:'100%', width:`${pct}%`,
            background:color, borderRadius:3, transition:'width 0.4s' }}/>
        </div>
      </div>
    )
  }

  return (
    <RolePageWrapper userId={userId} role="bursar" profile={profile} school={school} title="Reports">
      <div style={{ display:'flex', gap:'var(--space-3)', marginBottom:'var(--space-4)', alignItems:'center' }}>
        <input value={year} onChange={e => setYear(e.target.value)} placeholder="2024/2025"
          style={{ height:40, padding:'0 12px', background:'var(--input-bg)',
            border:'1px solid var(--input-border)', borderRadius:8,
            color:'var(--text-primary)', fontSize:'0.82rem', outline:'none',
            width:110, flexShrink:0 }}/>
        <div className={styles.tabs} style={{ flex:1 }}>
          {TERMS.map(t => (
            <button key={t} onClick={() => setTerm(t)}
              className={`${styles.tab} ${term===t ? styles.tabActive : ''}`}
              style={term===t ? { background:sc, color:'#fff', borderColor:sc } : {}}>
              {t.replace(' Term','')}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tabs} style={{ marginBottom:'var(--space-5)' }}>
        {([['summary','Summary'],['by_class','By Class'],['by_type','By Type']] as const)
          .map(([key, lbl]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`${styles.tab} ${tab===key ? styles.tabActive : ''}`}
              style={tab===key ? { background:sc, color:'#fff', borderColor:sc } : {}}>
              {lbl}
            </button>
          ))}
      </div>

      {error && (
        <div style={{ padding:'10px 14px', background:'#EF444415', border:'1px solid #EF444440',
          borderRadius:8, marginBottom:'var(--space-4)', fontSize:'0.8rem', color:'#EF4444', fontWeight:600 }}>
          ⚠️ {error}
        </div>
      )}

      {loading
        ? <div className={styles.loading}><span/><span/><span/></div>
        : !report
          ? <div className={styles.empty}>
              <BarChartIcon size={40} color="var(--text-faint)" strokeWidth={1}/>
              <p>No data available</p>
            </div>
          : <>
              {/* ── Summary ─────────────────────────────────── */}
              {tab === 'summary' && (
                <>
                  <div className={styles.statsRow} style={{ marginBottom:'var(--space-5)' }}>
                    {[
                      { label:'Collected',      value: fmtAmt(report.totalCollected), color:'#10B981' },
                      { label:'Students Paid',  value: report.paidCount,              color: sc       },
                      { label:'Not Paid',       value: report.unpaidCount,            color:'#EF4444' },
                      { label:'Total Students', value: report.studentCount,           color:'#F59E0B' },
                    ].map(s => (
                      <div key={s.label} className={styles.statCard}>
                        <p className={styles.statVal} style={{ color:s.color }}>{s.value}</p>
                        <p className={styles.statLbl}>{s.label}</p>
                      </div>
                    ))}
                  </div>

                  <div style={{ background:'var(--glass-bg)', border:'1px solid var(--glass-border)',
                    borderRadius:'var(--radius-xl)', padding:'var(--space-5)' }}>
                    <div style={{ display:'flex', justifyContent:'space-between',
                      alignItems:'baseline', marginBottom:'var(--space-3)' }}>
                      <p style={{ fontSize:'0.85rem', fontWeight:800,
                        color:'var(--text-primary)', margin:0 }}>
                        Collection Rate
                      </p>
                      <p style={{ fontSize:'0.8rem', color:'var(--text-muted)', margin:0 }}>
                        {term} {year}
                      </p>
                    </div>
                    <Bar
                      value={report.paidCount}
                      max={report.studentCount || 1}
                      color={sc}
                    />
                    <p style={{ fontSize:'0.72rem', color:'var(--text-muted)',
                      margin:'var(--space-3) 0 0' }}>
                      {report.paidCount} of {report.studentCount} students have made at least one payment
                    </p>
                  </div>
                </>
              )}

              {/* ── By Class ────────────────────────────────── */}
              {tab === 'by_class' && (
                <div style={{ display:'grid', gap:'var(--space-4)' }}>
                  {Object.keys(report.byClass).length === 0
                    ? <div className={styles.empty}>
                        <BarChartIcon size={32} color="var(--text-faint)" strokeWidth={1}/>
                        <p>No class data yet</p>
                      </div>
                    : Object.entries(report.byClass)
                        .sort(([a], [b]) => a.localeCompare(b))
                        .map(([cl, vals]: any) => (
                          <div key={cl} style={{ background:'var(--glass-bg)',
                            border:'1px solid var(--glass-border)',
                            borderRadius:'var(--radius-xl)', padding:'var(--space-4)' }}>
                            <div style={{ display:'flex', justifyContent:'space-between',
                              alignItems:'baseline', marginBottom:'var(--space-3)' }}>
                              <p style={{ fontSize:'0.88rem', fontWeight:800,
                                color:'var(--text-primary)', margin:0 }}>{cl}</p>
                              {vals.expected > 0 && (
                                <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:0 }}>
                                  of {fmtAmt(vals.expected)}
                                </p>
                              )}
                            </div>
                            <Bar value={vals.collected} max={vals.expected || vals.collected || 1}/>
                          </div>
                        ))
                  }
                </div>
              )}

              {/* ── By Type ─────────────────────────────────── */}
              {tab === 'by_type' && (
                <div style={{ display:'grid', gap:'var(--space-4)' }}>
                  {Object.keys(report.byType).length === 0
                    ? <div className={styles.empty}>
                        <BarChartIcon size={32} color="var(--text-faint)" strokeWidth={1}/>
                        <p>No payment types yet</p>
                      </div>
                    : Object.entries(report.byType)
                        .sort(([, a]: any, [, b]: any) => b - a)
                        .map(([type, amount]: any) => (
                          <div key={type} style={{ background:'var(--glass-bg)',
                            border:'1px solid var(--glass-border)',
                            borderRadius:'var(--radius-xl)', padding:'var(--space-4)' }}>
                            <div style={{ display:'flex', justifyContent:'space-between',
                              alignItems:'baseline', marginBottom:'var(--space-3)' }}>
                              <p style={{ fontSize:'0.88rem', fontWeight:800,
                                color:'var(--text-primary)', margin:0, textTransform:'capitalize' }}>
                                {TYPE_LABELS[type] ?? type.replace(/_/g, ' ')}
                              </p>
                              <p style={{ fontSize:'0.88rem', fontWeight:800, color:sc, margin:0 }}>
                                {fmtAmt(amount)}
                              </p>
                            </div>
                            <Bar value={amount} max={report.totalCollected || 1}/>
                          </div>
                        ))
                  }
                </div>
              )}
            </>
      }
      <div className={styles.spacer}/>
    </RolePageWrapper>
  )
}
