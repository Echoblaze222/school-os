'use client'
// src/app/dashboard/bursar/analytics/AnalyticsClient.tsx
// Bursar analytics: Overview / Collections / Cash flow / Follow-up.
// Data: public.bursar_analytics(p_days) (security invoker, bursar-only).

import { useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import { BURSAR_FEATURE_GROUPS } from '../featureGroups'
import { SkeletonBlock } from '@/components/motion/Skeleton'
import {
  ChartTheme, ChartCard, TrendArea, CompareBars, Donut,
  useRpc, Chip, Stat, StatGrid, FilterRow, ErrorNote, DataTable, gridStyle,
  naira, nairaFull, pct, monthLabel, dayLabel,
} from '@/components/charts'

interface Props { profile: any; school: any; userId: string }

type Tab = 'overview' | 'collections' | 'cashflow' | 'followup'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'collections', label: 'Collections' },
  { id: 'cashflow', label: 'Cash flow' },
  { id: 'followup', label: 'Follow-up' },
]
const RANGES = [
  { days: 90, label: '90 days' },
  { days: 180, label: '6 months' },
  { days: 365, label: '12 months' },
]
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' ')

export default function AnalyticsClient({ profile, school, userId }: Props) {
  const brand = school?.primary_color ?? '#800020'
  const [tab, setTab] = useState<Tab>('overview')
  const [days, setDays] = useState(180)
  const { data: d, error, loading, refreshing } = useRpc('bursar_analytics', { p_days: days })

  const weekly: any[] = d?.weekly ?? []
  const cash: any[] = d?.cashflow ?? []
  const aging: any[] = d?.aging ?? []
  const over60 = aging.find(a => a.bucket === '60+ days')
  const billed = d?.billed ?? 0
  const collectedPct = billed > 0 ? ((d?.collected ?? 0) / billed) * 100 : null
  const net = d ? d.collected_window - d.expenses_window : 0
  const claims = d?.claims
  const pendingClaims = (claims?.by_status ?? []).find((c: any) => c.status === 'pending')
  const oldPending = (claims?.pending_age ?? []).find((c: any) => c.bucket === '8+ days')
  const rem: any[] = d?.reminders ?? []
  const remSent = rem.reduce((a, r) => a + r.sent, 0)
  const remAll = rem.reduce((a, r) => a + r.sent + r.failed + r.pending, 0)
  const methods: any[] = d?.by_method ?? []
  const topMethod = methods[0]
  const methodTotal = methods.reduce((a, m) => a + m.amount, 0)

  const insightCollect = collectedPct == null ? undefined
    : `${pct(collectedPct, 0)} of billed fees collected · ${naira(d.outstanding)} still outstanding`
  const insightCash = !d ? undefined
    : net >= 0 ? `Collections covered expenses with ${naira(net)} to spare`
    : `Expenses outpaced collections by ${naira(-net)} in this period`
  const insightAging = over60 ? `${naira(over60.amount)} across ${over60.count} invoices is over 60 days late` : undefined
  const insightClaims = pendingClaims
    ? `${pendingClaims.count} claim${pendingClaims.count === 1 ? '' : 's'} awaiting review${oldPending ? ` · ${oldPending.count} waiting 8+ days` : ''}`
    : 'No claims waiting for review'
  const insightMethods = topMethod && methodTotal > 0
    ? `${cap(topMethod.method)} brings in ${pct((topMethod.amount / methodTotal) * 100, 0)} of collections` : undefined

  return (
    <RoleSubHeader userId={userId} role="bursar" profile={profile} school={school} title="Analytics" featureGroups={BURSAR_FEATURE_GROUPS}>
      <ChartTheme>
        <div style={{ padding: '0 var(--space-5) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div role="tablist" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            {TABS.map(t => <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} brand={brand}>{t.label}</Chip>)}
          </div>
          <FilterRow>
            {RANGES.map(r => <Chip key={r.days} active={days === r.days} onClick={() => setDays(r.days)} brand={brand}>{r.label}</Chip>)}
          </FilterRow>
        </div>

        {error && <div style={{ padding: '0 var(--space-5) var(--space-3)' }}><ErrorNote message={error} /></div>}

        {loading ? (
          <div style={{ padding: '0 var(--space-5)', display: 'grid', gap: 12 }}>
            <SkeletonBlock height={72} radius={14} />
            <SkeletonBlock height={260} radius={14} />
          </div>
        ) : d && (
          <div className="viz-fade" style={{ padding: '0 var(--space-5)', ...gridStyle, opacity: refreshing ? 0.6 : 1 }}>

            {tab === 'overview' && (
              <>
                <StatGrid min={160}>
                  <Stat label="Collected" value={naira(d.collected_window)} sub={`last ${days} days`} trend={weekly.slice(-12).map(w => w.collected)} />
                  <Stat label="Outstanding" value={naira(d.outstanding)} sub={over60 ? `${naira(over60.amount)} is 60+ days late` : undefined} />
                  <Stat label="Expenses" value={naira(d.expenses_window)} sub={`last ${days} days`} />
                  <Stat label="Net position" value={`${net < 0 ? '-' : ''}${naira(Math.abs(net))}`} sub="collected − expenses" />
                </StatGrid>

                <ChartCard title="Collections per week" insight={insightCollect} empty={!weekly.length}
                  table={{ columns: ['Week of', 'Collected'], rows: weekly.map(w => [w.week, nairaFull(w.collected)]) }}>
                  <TrendArea data={weekly} xKey="week" series={[{ key: 'collected', label: 'Collected' }]}
                    xFormat={dayLabel} yFormat={naira} valueFormat={nairaFull} />
                </ChartCard>

                <ChartCard title="Collected vs expenses" insight={insightCash} empty={!cash.length}
                  table={{ columns: ['Month', 'Collected', 'Expenses'], rows: cash.map(c => [monthLabel(c.month), nairaFull(c.collected), nairaFull(c.expenses)]) }}>
                  <CompareBars data={cash.map(c => ({ ...c, label: monthLabel(c.month) }))} catKey="label"
                    series={[{ key: 'collected', label: 'Collected', slot: 0 }, { key: 'expenses', label: 'Expenses', slot: 1 }]}
                    axisFormat={naira} valueFormat={nairaFull} />
                </ChartCard>

                <ChartCard title="Outstanding by age" insight={insightAging} empty={!aging.length} emptyText="Nothing outstanding."
                  table={{ columns: ['Age', 'Invoices', 'Amount'], rows: aging.map(a => [a.bucket, a.count, nairaFull(a.amount)]) }}>
                  <CompareBars horizontal tipLabels data={aging} catKey="bucket" series={[{ key: 'amount', label: 'Outstanding' }]}
                    highlight="60+ days" axisFormat={naira} valueFormat={naira} />
                </ChartCard>
              </>
            )}

            {tab === 'collections' && (
              <>
                <ChartCard title="How fees are paid" insight={insightMethods} empty={!methods.length}
                  table={{ columns: ['Method', 'Payments', 'Amount'], rows: methods.map(m => [cap(m.method), m.count, nairaFull(m.amount)]) }}>
                  <Donut valueFormat={naira} centerValue={naira(methodTotal)} centerLabel={`last ${days} days`}
                    data={methods.map(m => ({ label: cap(m.method), value: m.amount }))} />
                </ChartCard>

                <ChartCard title="Billed vs collected by class" empty={!(d.by_class ?? []).length}
                  table={{ columns: ['Class', 'Billed', 'Collected', 'Outstanding'], rows: (d.by_class ?? []).map((c: any) => [c.class, nairaFull(c.billed), nairaFull(c.paid), nairaFull(c.outstanding)]) }}>
                  <CompareBars data={d.by_class ?? []} catKey="class"
                    series={[{ key: 'billed', label: 'Billed', slot: 0 }, { key: 'paid', label: 'Collected', slot: 2 }]}
                    axisFormat={naira} valueFormat={nairaFull} />
                </ChartCard>

                <ChartCard title="Invoice status" empty={!(d.invoice_status ?? []).length}
                  table={{ columns: ['Status', 'Invoices', 'Billed'], rows: (d.invoice_status ?? []).map((s: any) => [cap(s.status), s.count, nairaFull(s.amount)]) }}>
                  <Donut centerValue={String((d.invoice_status ?? []).reduce((a: number, s: any) => a + s.count, 0))} centerLabel="invoices"
                    data={(d.invoice_status ?? []).map((s: any) => ({ label: cap(s.status), value: s.count }))} />
                </ChartCard>
              </>
            )}

            {tab === 'cashflow' && (
              <>
                <StatGrid min={150}>
                  <Stat label="Collected" value={naira(d.collected_window)} />
                  <Stat label="Expenses" value={naira(d.expenses_window)} />
                  <Stat label="Net" value={`${net < 0 ? '-' : ''}${naira(Math.abs(net))}`} />
                  {d.platform_fees_window > 0 && <Stat label="Platform fees" value={naira(d.platform_fees_window)} sub="deducted from online payments" />}
                </StatGrid>

                <ChartCard title="Monthly cash flow" insight={insightCash} empty={!cash.length}
                  table={{ columns: ['Month', 'Collected', 'Expenses'], rows: cash.map(c => [monthLabel(c.month), nairaFull(c.collected), nairaFull(c.expenses)]) }}>
                  <CompareBars data={cash.map(c => ({ ...c, label: monthLabel(c.month) }))} catKey="label"
                    series={[{ key: 'collected', label: 'Collected', slot: 0 }, { key: 'expenses', label: 'Expenses', slot: 1 }]}
                    axisFormat={naira} valueFormat={nairaFull} />
                </ChartCard>

                <ChartCard title="Where the money goes" empty={!(d.expenses_by_category ?? []).length}
                  insight={(d.expenses_by_category ?? [])[0] ? `${cap(d.expenses_by_category[0].category)} is the largest cost at ${naira(d.expenses_by_category[0].amount)}` : undefined}
                  table={{ columns: ['Category', 'Amount'], rows: (d.expenses_by_category ?? []).map((e: any) => [cap(e.category), nairaFull(e.amount)]) }}>
                  <CompareBars horizontal tipLabels data={(d.expenses_by_category ?? []).map((e: any) => ({ ...e, label: cap(e.category) }))} catKey="label"
                    series={[{ key: 'amount', label: 'Spent', slot: 1 }]} axisFormat={naira} valueFormat={naira} />
                </ChartCard>
              </>
            )}

            {tab === 'followup' && (
              <>
                <ChartCard title="Biggest balances" subtitle="Students with the most unpaid fees" empty={!(d.top_debtors ?? []).length} emptyText="No outstanding balances."
                  table={{ columns: ['Student', 'Class', 'Balance', 'Days overdue'], rows: (d.top_debtors ?? []).map((t: any) => [t.student, t.class ?? '–', nairaFull(t.balance), t.days_overdue]) }}>
                  <DataTable columns={['Student', 'Class', 'Balance', 'Days overdue']}
                    rows={(d.top_debtors ?? []).map((t: any) => [t.student, t.class ?? '–', nairaFull(t.balance), t.days_overdue])} />
                </ChartCard>

                <ChartCard title="Payment claims" insight={insightClaims} empty={!(claims?.by_status ?? []).length}
                  subtitle={claims?.avg_review_hours != null ? `Reviewed in ${claims.avg_review_hours} hours on average` : undefined}
                  table={{ columns: ['Status', 'Claims', 'Amount'], rows: (claims?.by_status ?? []).map((c: any) => [cap(c.status), c.count, nairaFull(c.amount)]) }}>
                  <CompareBars data={(claims?.by_status ?? []).map((c: any) => ({ ...c, label: cap(c.status) }))} catKey="label"
                    series={[{ key: 'count', label: 'Claims' }]} tipLabels />
                </ChartCard>

                <ChartCard title="Reminders sent" empty={!rem.length}
                  insight={remAll ? `${pct((remSent / remAll) * 100, 0)} of reminders were delivered` : undefined}
                  table={{ columns: ['Channel', 'Sent', 'Failed', 'Pending'], rows: rem.map(r => [cap(r.channel), r.sent, r.failed, r.pending]) }}>
                  <CompareBars stacked data={rem.map(r => ({ ...r, label: cap(r.channel) }))} catKey="label"
                    series={[{ key: 'sent', label: 'Sent', slot: 2 }, { key: 'failed', label: 'Failed', slot: 7 }, { key: 'pending', label: 'Pending', slot: 3 }]} />
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
