'use client'
// Compact analytics block for the principal's main dashboard.
// Full version lives at /dashboard/principal/analytics.

import Link from 'next/link'
import { SkeletonBlock } from '@/components/motion/Skeleton'
import {
  ChartTheme, ChartCard, TrendArea, CompareBars, useRpc, ErrorNote,
  naira, nairaFull, pct, monthLabel, dayLabel,
} from '@/components/charts'

export default function PrincipalHomeCharts() {
  const fin = useRpc('principal_analytics_finance')
  const att = useRpc('principal_analytics_attendance', { p_days: 30 })

  const f: any = fin.data
  const a: any = att.data
  const monthly: any[] = f?.monthly ?? []
  const daily: any[] = a?.daily ?? []
  const byClass: any[] = f?.by_class ?? []
  const collectedPct = f?.billed ? (f.collected / f.billed) * 100 : null
  const worst = (a?.by_class ?? []).length ? [...a.by_class].sort((x: any, y: any) => x.rate - y.rate)[0] : null

  return (
    <ChartTheme>
      <section style={{ display: 'grid', gap: 12, margin: 'var(--space-4) 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>School at a glance</h2>
          <Link href="/dashboard/principal/analytics" style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand)' }}>Full analytics →</Link>
        </div>

        {(fin.error || att.error) && <ErrorNote message={(fin.error || att.error) as string} />}

        {fin.loading || att.loading ? (
          <div style={{ display: 'grid', gap: 12 }}>
            <SkeletonBlock height={240} radius={20} />
            <SkeletonBlock height={240} radius={20} />
          </div>
        ) : (
          <>
            <ChartCard
              title="Fees collected per month"
              insight={collectedPct == null ? undefined : `${pct(collectedPct, 0)} of billed fees collected · ${naira(f?.outstanding)} outstanding`}
              empty={!monthly.length}
              table={{ columns: ['Month', 'Collected'], rows: monthly.map((m: any) => [monthLabel(m.month), nairaFull(m.collected)]) }}
            >
              <TrendArea data={monthly} xKey="month" series={[{ key: 'collected', label: 'Collected' }]}
                xFormat={monthLabel} yFormat={naira} valueFormat={nairaFull} height={200} />
            </ChartCard>

            <ChartCard
              title="Attendance, last 30 days"
              insight={a?.rate == null ? 'No attendance marked in this window' : `${pct(a.rate, 1)} present${worst ? ` · ${worst.class} is lowest at ${pct(worst.rate, 1)}` : ''}`}
              empty={!daily.length}
              table={{ columns: ['Date', 'Present %'], rows: daily.map((d: any) => [d.date, d.rate]) }}
            >
              <TrendArea data={daily} xKey="date" series={[{ key: 'rate', label: 'Present %', slot: 2 }]}
                xFormat={dayLabel} yFormat={(v: number) => `${v}`} valueFormat={(v: number) => `${v}%`} yDomain={[0, 100]} height={200} />
            </ChartCard>

            <ChartCard
              title="Billed vs collected by class"
              empty={!byClass.length}
              table={{ columns: ['Class', 'Billed', 'Collected', 'Outstanding'], rows: byClass.map((c: any) => [c.class, nairaFull(c.billed), nairaFull(c.paid), nairaFull(c.outstanding)]) }}
            >
              <CompareBars data={byClass} catKey="class"
                series={[{ key: 'billed', label: 'Billed', slot: 0 }, { key: 'paid', label: 'Collected', slot: 2 }]}
                axisFormat={naira} valueFormat={nairaFull} />
            </ChartCard>
          </>
        )}
      </section>
    </ChartTheme>
  )
}
