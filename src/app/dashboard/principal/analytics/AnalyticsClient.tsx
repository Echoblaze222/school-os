'use client'
// src/app/dashboard/principal/analytics/AnalyticsClient.tsx
//
// Principal analytics: Overview / Academics / Attendance / Finance.
// All numbers come from security-invoker Postgres RPCs (see
// sql/migrations/2026-10-27-principal-analytics.sql) so the school is derived
// server-side from auth.uid() and only approved results are counted.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import { PRINCIPAL_FEATURE_GROUPS } from '../featureGroups'
import { SkeletonBlock } from '@/components/motion/Skeleton'
import {
  ChartTheme, ChartCard, TrendArea, CompareBars, Donut, Heatmap, Sparkline,
  naira, nairaFull, pct, monthLabel, dayLabel,
} from '@/components/charts'

interface Props { profile: any; school: any; userId: string }

type Tab = 'overview' | 'academics' | 'attendance' | 'finance'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'academics', label: 'Academics' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'finance', label: 'Finance' },
]
const TERMS = [
  { value: 'first', label: 'First' },
  { value: 'second', label: 'Second' },
  { value: 'third', label: 'Third' },
]
const RANGES = [
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
  { days: 90, label: '90 days' },
]
const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const termLabel = (t: string) => TERMS.find(x => x.value === t)?.label ?? t

function Chip({ active, onClick, children, brand }: { active: boolean; onClick: () => void; children: React.ReactNode; brand: string }) {
  return (
    <button
      className="pressable"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '6px 14px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
        background: active ? brand : 'var(--glass-bg)', color: active ? '#fff' : 'var(--text-muted)',
        border: active ? `1px solid ${brand}` : '1px solid var(--glass-border)',
      }}
    >
      {children}
    </button>
  )
}

function Stat({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number[] }) {
  return (
    <div className="glass-card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {trend && <Sparkline values={trend} />}
    </div>
  )
}

export default function AnalyticsClient({ profile, school, userId }: Props) {
  const supabase = useMemo(() => createClient(), [])
  const brand = school?.primary_color ?? '#800020'

  const [tab, setTab] = useState<Tab>('overview')
  const [sel, setSel] = useState<{ term: string; year: string } | null>(null)
  const [days, setDays] = useState(30)

  const [acad, setAcad] = useState<any>(null)
  const [att, setAtt] = useState<any>(null)
  const [fin, setFin] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(0)

  const run = useCallback(async (fn: () => PromiseLike<{ data: any; error: any }>, set: (v: any) => void) => {
    setBusy(b => b + 1)
    const { data, error: e } = await fn()
    if (e) setError(e.message)
    else { setError(null); set(data) }
    setBusy(b => b - 1)
  }, [])

  // First load: unscoped academics gives the term trend, from which we pick the latest term as default.
  useEffect(() => {
    run(() => supabase.rpc('principal_analytics_academics', { p_term: null, p_year: null }), (d: any) => {
      const t = d?.term_trend ?? []
      const last = t[t.length - 1]
      setSel(last ? { term: last.term, year: last.year } : { term: 'first', year: '' })
      setAcad(d)
    })
    run(() => supabase.rpc('principal_analytics_finance'), setFin)
  }, [run, supabase])

  useEffect(() => {
    if (!sel || !sel.year) return
    run(
      () => supabase.rpc('principal_analytics_academics', { p_term: sel.term, p_year: sel.year }),
      (d: any) => setAcad((prev: any) => ({ ...d, term_trend: prev?.term_trend ?? d.term_trend })),
    )
  }, [sel, run, supabase])

  useEffect(() => {
    run(() => supabase.rpc('principal_analytics_attendance', { p_days: days }), setAtt)
  }, [days, run, supabase])

  const years: string[] = useMemo(
    () => Array.from(new Set<string>((acad?.term_trend ?? []).map((t: any) => t.year))),
    [acad?.term_trend],
  )
  const firstLoad = !acad || !fin || !att
  const refreshing = !firstLoad && busy > 0

  // ── Derived insights (state facts, don't describe charts) ─────────────────────────
  const trend: any[] = acad?.term_trend ?? []
  const trendRows = trend.map(t => ({ ...t, label: `${termLabel(t.term)} ${t.year.slice(2, 4)}/${t.year.slice(7)}` }))
  const prevTerm = (() => {
    const i = trend.findIndex(t => sel && t.term === sel.term && t.year === sel.year)
    return i > 0 ? trend[i - 1] : null
  })()
  const avgDelta = prevTerm && acad?.average != null ? acad.average - prevTerm.average : null
  const subjects: any[] = acad?.by_subject ?? []
  const weakest = subjects.length ? subjects[subjects.length - 1] : null
  const strongest = subjects.length ? subjects[0] : null
  const heatClasses: string[] = Array.from(new Set((acad?.heatmap ?? []).map((c: any) => c.class))) as string[]
  const heatSubjects: string[] = Array.from(new Set((acad?.heatmap ?? []).map((c: any) => c.subject))) as string[]

  const attClasses: any[] = att?.by_class ?? []
  const worstClass = attClasses.length ? [...attClasses].sort((a, b) => a.rate - b.rate)[0] : null
  const weekday = (att?.weekday ?? []).map((w: any) => ({ ...w, day: DOW[w.dow] }))
  const worstDay = weekday.length ? [...weekday].sort((a: any, b: any) => a.rate - b.rate)[0] : null

  const collectedPct = fin && fin.billed > 0 ? (fin.collected / fin.billed) * 100 : null
  const over60 = (fin?.aging ?? []).find((a: any) => a.bucket === '60+ days')

  const insightAcad = acad?.average == null ? 'No approved results for this term yet'
    : avgDelta == null ? `School average is ${pct(acad.average, 1)}, ${pct(acad.pass_rate, 0)} pass`
    : `Average ${avgDelta >= 0 ? 'rose' : 'fell'} ${Math.abs(avgDelta).toFixed(1)} pts to ${pct(acad.average, 1)} vs last term`
  const insightAtt = att?.rate == null ? 'No attendance marked in this window'
    : `${pct(att.rate, 1)} present${worstClass ? ` · ${worstClass.class} is lowest at ${pct(worstClass.rate, 1)}` : ''}`
  const insightFin = !fin ? '' : collectedPct == null ? 'No invoices issued yet'
    : `${pct(collectedPct, 0)} of billed fees collected · ${naira(fin.outstanding)} outstanding`

  return (
    <RoleSubHeader userId={userId} role="principal" profile={profile} school={school} title="Analytics" featureGroups={PRINCIPAL_FEATURE_GROUPS}>
      <ChartTheme>
        {/* One filter row above everything it scopes */}
        <div style={{ padding: '0 var(--space-5) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {TABS.map(t => (
              <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} brand={brand}>{t.label}</Chip>
            ))}
          </div>
          {(tab === 'academics' || tab === 'overview') && sel && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {years.length > 0 && (
                <select
                  className="input"
                  value={sel.year}
                  onChange={e => setSel({ ...sel, year: e.target.value })}
                  aria-label="Academic year"
                  style={{ height: 34, width: 120, fontSize: '0.8rem' }}
                >
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              )}
              {TERMS.map(t => (
                <Chip key={t.value} active={sel.term === t.value} onClick={() => setSel({ ...sel, term: t.value })} brand={brand}>{t.label}</Chip>
              ))}
            </div>
          )}
          {(tab === 'attendance' || tab === 'overview') && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {RANGES.map(r => (
                <Chip key={r.days} active={days === r.days} onClick={() => setDays(r.days)} brand={brand}>{r.label}</Chip>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{ margin: '0 var(--space-5) var(--space-3)', padding: 12, borderRadius: 10, fontSize: 13, color: 'var(--danger)', border: '1px solid var(--glass-border)' }}>
            Couldn’t load analytics: {error}
          </div>
        )}

        {firstLoad && !error ? (
          <div style={{ padding: '0 var(--space-5)', display: 'grid', gap: 12 }}>
            <SkeletonBlock height={72} radius={14} />
            <SkeletonBlock height={260} radius={14} />
          </div>
        ) : (
          <div className="viz-fade" style={{ padding: '0 var(--space-5)', display: 'grid', gap: 'var(--space-4)', opacity: refreshing ? 0.6 : 1 }}>

            {/* ─────────── OVERVIEW ─────────── */}
            {tab === 'overview' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                  <Stat label="Average score" value={acad?.average == null ? '–' : pct(acad.average, 1)}
                    sub={sel ? `${termLabel(sel.term)} term` : undefined} trend={trend.map(t => t.average)} />
                  <Stat label="Attendance" value={att?.rate == null ? '–' : pct(att.rate, 1)}
                    sub={`last ${days} days`} trend={(att?.daily ?? []).slice(-12).map((d: any) => d.rate)} />
                  <Stat label="Fees collected" value={naira(fin?.collected)}
                    sub={collectedPct == null ? undefined : `${pct(collectedPct, 0)} of billed`}
                    trend={(fin?.monthly ?? []).slice(-12).map((m: any) => m.collected)} />
                  <Stat label="Outstanding" value={naira(fin?.outstanding)}
                    sub={over60 ? `${naira(over60.amount)} is 60+ days late` : undefined} />
                </div>

                <ChartCard title="Academic average by term" insight={insightAcad} empty={!trendRows.length}
                  table={{ columns: ['Term', 'Average %', 'Pass rate %'], rows: trendRows.map(t => [t.label, t.average, t.pass_rate]) }}>
                  <TrendArea data={trendRows} xKey="label" series={[{ key: 'average', label: 'Average %' }]}
                    yFormat={v => `${v}`} valueFormat={v => `${v}%`} yDomain={[0, 100]} target={{ value: 50, label: 'Pass mark' }} />
                </ChartCard>

                <ChartCard title="Daily attendance" insight={insightAtt} empty={!(att?.daily ?? []).length}
                  table={{ columns: ['Date', 'Present %'], rows: (att?.daily ?? []).map((d: any) => [d.date, d.rate]) }}>
                  <TrendArea data={att?.daily ?? []} xKey="date" series={[{ key: 'rate', label: 'Present %', slot: 2 }]}
                    xFormat={dayLabel} yFormat={v => `${v}`} valueFormat={v => `${v}%`} yDomain={[50, 100]} />
                </ChartCard>

                <ChartCard title="Fees collected per month" insight={insightFin} empty={!(fin?.monthly ?? []).length}
                  table={{ columns: ['Month', 'Collected'], rows: (fin?.monthly ?? []).map((m: any) => [monthLabel(m.month), nairaFull(m.collected)]) }}>
                  <CompareBars data={fin?.monthly ?? []} catKey="month" series={[{ key: 'collected', label: 'Collected' }]}
                    axisFormat={naira} valueFormat={nairaFull} />
                </ChartCard>
              </>
            )}

            {/* ─────────── ACADEMICS ─────────── */}
            {tab === 'academics' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  <Stat label="Average score" value={acad?.average == null ? '–' : pct(acad.average, 1)} />
                  <Stat label="Pass rate (50%+)" value={acad?.pass_rate == null ? '–' : pct(acad.pass_rate, 1)} />
                  <Stat label="Results counted" value={String(acad?.result_count ?? 0)} sub="approved only" />
                </div>

                <ChartCard title="Average by term" insight={insightAcad} empty={!trendRows.length}
                  table={{ columns: ['Term', 'Average %', 'Pass rate %'], rows: trendRows.map(t => [t.label, t.average, t.pass_rate]) }}>
                  <TrendArea data={trendRows} xKey="label"
                    series={[{ key: 'average', label: 'Average %', slot: 0 }, { key: 'pass_rate', label: 'Pass rate %', slot: 2 }]}
                    valueFormat={v => `${v}%`} yDomain={[0, 100]} />
                </ChartCard>

                <ChartCard title="Subjects, strongest to weakest"
                  insight={weakest && strongest && weakest.subject !== strongest.subject
                    ? `${weakest.subject} trails at ${pct(weakest.average, 1)}; ${strongest.subject} leads at ${pct(strongest.average, 1)}` : undefined}
                  empty={!subjects.length}
                  table={{ columns: ['Subject', 'Average %', 'Pass rate %'], rows: subjects.map(s => [s.subject, s.average, s.pass_rate]) }}>
                  <CompareBars horizontal tipLabels data={subjects} catKey="subject" series={[{ key: 'average', label: 'Average %' }]}
                    highlight={weakest?.subject} valueFormat={v => `${v}%`} domainMax={100} />
                </ChartCard>

                <ChartCard title="Class × subject averages" subtitle="Darker is higher" empty={!(acad?.heatmap ?? []).length}
                  table={{ columns: ['Class', 'Subject', 'Average %'], rows: (acad?.heatmap ?? []).map((c: any) => [c.class, c.subject, c.average]) }}>
                  <Heatmap cells={(acad?.heatmap ?? []).map((c: any) => ({ row: c.class, col: c.subject, value: c.average }))}
                    rows={heatClasses} cols={heatSubjects} valueFormat={v => `${Math.round(v)}`} measure="% average" />
                </ChartCard>

                <ChartCard title="Grade distribution" empty={!(acad?.grades ?? []).length}
                  table={{ columns: ['Band', 'Results'], rows: (acad?.grades ?? []).map((g: any) => [g.band, g.count]) }}>
                  <CompareBars data={acad?.grades ?? []} catKey="band" series={[{ key: 'count', label: 'Results' }]} tipLabels />
                </ChartCard>
              </>
            )}

            {/* ─────────── ATTENDANCE ─────────── */}
            {tab === 'attendance' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  <Stat label="Present rate" value={att?.rate == null ? '–' : pct(att.rate, 1)} sub={`last ${days} days`} />
                  <Stat label="Chronic absentees" value={String(att?.chronic_absentees ?? 0)} sub="below 80% present" />
                  <Stat label="Marks recorded" value={String(att?.marks ?? 0)} />
                </div>

                <ChartCard title="Daily attendance" insight={insightAtt} empty={!(att?.daily ?? []).length}
                  table={{ columns: ['Date', 'Present %'], rows: (att?.daily ?? []).map((d: any) => [d.date, d.rate]) }}>
                  <TrendArea data={att?.daily ?? []} xKey="date" series={[{ key: 'rate', label: 'Present %', slot: 2 }]}
                    xFormat={dayLabel} valueFormat={v => `${v}%`} yDomain={[50, 100]} />
                </ChartCard>

                <ChartCard title="By class" empty={!attClasses.length}
                  table={{ columns: ['Class', 'Present %'], rows: attClasses.map(c => [c.class, c.rate]) }}>
                  <CompareBars horizontal tipLabels data={attClasses} catKey="class" series={[{ key: 'rate', label: 'Present %', slot: 2 }]}
                    highlight={worstClass?.class} valueFormat={v => `${v}%`} domainMax={100} />
                </ChartCard>

                <ChartCard title="Day of week"
                  insight={worstDay ? `${worstDay.day} is the weakest day at ${pct(worstDay.rate, 1)}` : undefined}
                  empty={!weekday.length}
                  table={{ columns: ['Day', 'Present %'], rows: weekday.map((w: any) => [w.day, w.rate]) }}>
                  <CompareBars data={weekday} catKey="day" series={[{ key: 'rate', label: 'Present %', slot: 2 }]}
                    highlight={worstDay?.day} valueFormat={v => `${v}%`} domainMax={100} />
                </ChartCard>

                <ChartCard title="Marks by status" empty={!(att?.status_mix ?? []).length}
                  table={{ columns: ['Status', 'Marks'], rows: (att?.status_mix ?? []).map((s: any) => [s.status, s.count]) }}>
                  <Donut data={(att?.status_mix ?? []).map((s: any) => ({ label: s.status[0].toUpperCase() + s.status.slice(1), value: s.count }))}
                    centerValue={att?.rate == null ? undefined : pct(att.rate, 0)} centerLabel="present" />
                </ChartCard>
              </>
            )}

            {/* ─────────── FINANCE ─────────── */}
            {tab === 'finance' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                  <Stat label="Billed" value={naira(fin?.billed)} sub={`${fin?.invoice_count ?? 0} invoices`} />
                  <Stat label="Collected" value={naira(fin?.collected)} sub={collectedPct == null ? undefined : `${pct(collectedPct, 0)} of billed`} />
                  <Stat label="Outstanding" value={naira(fin?.outstanding)} />
                </div>

                <ChartCard title="Collections per month" insight={insightFin} empty={!(fin?.monthly ?? []).length}
                  table={{ columns: ['Month', 'Collected'], rows: (fin?.monthly ?? []).map((m: any) => [monthLabel(m.month), nairaFull(m.collected)]) }}>
                  <TrendArea data={fin?.monthly ?? []} xKey="month" series={[{ key: 'collected', label: 'Collected' }]}
                    xFormat={monthLabel} yFormat={naira} valueFormat={nairaFull} />
                </ChartCard>

                <ChartCard title="How parents pay" empty={!(fin?.by_method ?? []).length}
                  table={{ columns: ['Method', 'Payments', 'Amount'], rows: (fin?.by_method ?? []).map((m: any) => [m.method, m.count, nairaFull(m.amount)]) }}>
                  <Donut valueFormat={naira} centerValue={naira(fin?.collected)} centerLabel="collected"
                    data={(fin?.by_method ?? []).map((m: any) => ({ label: m.method.replace('_', ' '), value: m.amount }))} />
                </ChartCard>

                <ChartCard title="Billed vs collected by class" empty={!(fin?.by_class ?? []).length}
                  table={{ columns: ['Class', 'Billed', 'Collected', 'Outstanding'], rows: (fin?.by_class ?? []).map((c: any) => [c.class, nairaFull(c.billed), nairaFull(c.paid), nairaFull(c.outstanding)]) }}>
                  <CompareBars data={fin?.by_class ?? []} catKey="class"
                    series={[{ key: 'billed', label: 'Billed', slot: 0 }, { key: 'paid', label: 'Collected', slot: 2 }]}
                    axisFormat={naira} valueFormat={nairaFull} />
                </ChartCard>

                <ChartCard title="Outstanding by age"
                  insight={over60 ? `${naira(over60.amount)} across ${over60.count} invoices is over 60 days late` : undefined}
                  empty={!(fin?.aging ?? []).length} emptyText="Nothing outstanding."
                  table={{ columns: ['Bucket', 'Invoices', 'Amount'], rows: (fin?.aging ?? []).map((a: any) => [a.bucket, a.count, nairaFull(a.amount)]) }}>
                  <CompareBars horizontal tipLabels data={fin?.aging ?? []} catKey="bucket" series={[{ key: 'amount', label: 'Outstanding' }]}
                    highlight="60+ days" axisFormat={naira} valueFormat={naira} />
                </ChartCard>
              </>
            )}

            <div style={{ height: 24 }} />
          </div>
        )}
      </ChartTheme>
    </RoleSubHeader>
  )
}
