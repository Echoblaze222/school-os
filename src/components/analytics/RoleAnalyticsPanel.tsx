'use client'
// Renders the declarative payload returned by the role analytics RPCs:
//   { tabs: [{ id, label, stats: [{label,value,sub}], cards: [{kind,title,insight,...}] }] }
// kinds: bars | trend | donut | table. See sql/migrations/2026-10-30-role-analytics-rpcs.sql.

import { useState } from 'react'
import { SkeletonBlock } from '@/components/motion/Skeleton'
import {
  ChartTheme, ChartCard, TrendArea, CompareBars, Donut,
  useRpc, Chip, Stat, StatGrid, FilterRow, ErrorNote, DataTable, gridStyle,
} from '@/components/charts'

interface Range { days: number; label: string }
interface Props { rpc: string; brand: string; ranges?: Range[]; defaultDays?: number }

function Card({ c }: { c: any }) {
  const fmt = c.unit === '%' ? (v: number) => `${v}%` : undefined
  const data: any[] = c.data ?? []
  const series: any[] = c.series ?? []
  const title: string = c.title

  if (c.kind === 'table') {
    const rows: (string | number)[][] = c.rows ?? []
    return (
      <ChartCard title={title} insight={c.insight ?? undefined} empty={!rows.length} emptyText="Nothing to show right now.">
        <DataTable columns={c.columns ?? []} rows={rows} />
      </ChartCard>
    )
  }

  if (c.kind === 'donut') {
    const total = data.reduce((a, d) => a + (d.value ?? 0), 0)
    return (
      <ChartCard title={title} insight={c.insight ?? undefined} empty={!data.length}
        table={{ columns: ['Item', 'Count'], rows: data.map(d => [d.label, d.value]) }}>
        <Donut data={data} centerValue={c.centerValue ?? (total ? String(total) : undefined)} centerLabel={c.centerLabel} />
      </ChartCard>
    )
  }

  const tableRows = data.map(d => [d.label, ...series.map(s => d[s.key] ?? 0)])
  const table = { columns: ['Item', ...series.map(s => s.label)], rows: tableRows }

  if (c.kind === 'trend') {
    const k = series[0]?.key
    const last = data[data.length - 1]?.[k]
    const prev = data[data.length - 2]?.[k]
    const fallback = data.length > 1 && last != null && prev != null
      ? `${series[0].label} is ${last}${c.unit === '%' ? '%' : ''}, was ${prev}${c.unit === '%' ? '%' : ''} the period before` : undefined
    return (
      <ChartCard title={title} insight={c.insight ?? fallback} empty={!data.length} table={table}>
        <TrendArea data={data} xKey="label" series={series} valueFormat={fmt} yDomain={c.yDomain} />
      </ChartCard>
    )
  }

  // bars
  let fallback: string | undefined
  if (series.length === 1 && data.length > 1) {
    const k = series[0].key
    const top = [...data].sort((a, b) => (b[k] ?? 0) - (a[k] ?? 0))[0]
    if (top && top[k] != null) fallback = `${top.label} is highest at ${top[k]}${c.unit === '%' ? '%' : ''}`
  }
  return (
    <ChartCard title={title} insight={c.insight ?? fallback} empty={!data.length} table={table}>
      <CompareBars data={data} catKey="label" series={series} horizontal={!!c.horizontal} stacked={!!c.stacked}
        valueFormat={fmt} domainMax={c.domainMax} />
    </ChartCard>
  )
}

export default function RoleAnalyticsPanel({ rpc, brand, ranges, defaultDays }: Props) {
  const [tab, setTab] = useState<string | null>(null)
  const [days, setDays] = useState(defaultDays ?? ranges?.[0]?.days ?? 0)
  const { data: d, error, loading, refreshing } = useRpc(rpc, ranges ? { p_days: days } : {})

  const tabs: any[] = d?.tabs ?? []
  const active = tabs.find(t => t.id === tab) ?? tabs[0]

  return (
    <ChartTheme>
      <div style={{ padding: '0 var(--space-5) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tabs.length > 1 && (
          <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {tabs.map(t => <Chip key={t.id} active={active?.id === t.id} onClick={() => setTab(t.id)} brand={brand}>{t.label}</Chip>)}
          </div>
        )}
        {ranges && (
          <FilterRow>
            {ranges.map(r => <Chip key={r.days} active={days === r.days} onClick={() => setDays(r.days)} brand={brand}>{r.label}</Chip>)}
          </FilterRow>
        )}
      </div>

      {error && <div style={{ padding: '0 var(--space-5) var(--space-3)' }}><ErrorNote message={error} /></div>}

      {loading ? (
        <div style={{ padding: '0 var(--space-5)', display: 'grid', gap: 12 }}>
          <SkeletonBlock height={72} radius={14} />
          <SkeletonBlock height={260} radius={14} />
        </div>
      ) : active && (
        <div className="viz-fade" style={{ padding: '0 var(--space-5)', ...gridStyle, opacity: refreshing ? 0.6 : 1 }}>
          <StatGrid min={150}>
            {(active.stats ?? []).map((s: any) => <Stat key={s.label} label={s.label} value={s.value} sub={s.sub} />)}
          </StatGrid>
          {(active.cards ?? []).map((c: any) => <Card key={`${active.id}-${c.title}`} c={c} />)}
          <div style={{ height: 24 }} />
        </div>
      )}
    </ChartTheme>
  )
}
