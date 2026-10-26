'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartCard } from './ChartCard'
import { CHART_COLORS, TOOLTIP_STYLE } from './chartTheme'

export interface DonutDatum {
  name: string
  value: number
}

interface DonutChartProps {
  title: string
  subtitle?: string
  data: DonutDatum[]
  centerValue?: string
  centerLabel?: string
  height?: number
}

const MAX_SLICES = 5

function capSlices(data: DonutDatum[]): DonutDatum[] {
  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value)
  if (sorted.length <= MAX_SLICES) return sorted
  const head = sorted.slice(0, MAX_SLICES - 1)
  const otherTotal = sorted.slice(MAX_SLICES - 1).reduce((sum, d) => sum + d.value, 0)
  return [...head, { name: 'Other', value: otherTotal }]
}

export function DonutChart({
  title,
  subtitle,
  data,
  centerValue,
  centerLabel,
  height = 200,
}: DonutChartProps) {
  const slices = capSlices(data)
  const total = slices.reduce((sum, d) => sum + d.value, 0)

  return (
    <ChartCard title={title} subtitle={subtitle} empty={total === 0}>
      <div style={{ position: 'relative', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius="62%"
              outerRadius="88%"
              paddingAngle={2}
              stroke="none"
            >
              {slices.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
          </PieChart>
        </ResponsiveContainer>
        {centerValue ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              pointerEvents: 'none',
            }}
          >
            <span style={{ fontSize: 22, fontWeight: 700 }}>{centerValue}</span>
            {centerLabel ? (
              <span style={{ fontSize: 11, opacity: 0.65 }}>{centerLabel}</span>
            ) : null}
          </div>
        ) : null}
      </div>
      <ul
        style={{
          listStyle: 'none',
          margin: '12px 0 0',
          padding: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: '6px 14px',
          fontSize: 12,
        }}
      >
        {slices.map((s, i) => (
          <li key={s.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 999,
                background: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
            {s.name} ({s.value})
          </li>
        ))}
      </ul>
    </ChartCard>
  )
}
