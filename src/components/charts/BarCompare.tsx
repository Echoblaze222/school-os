'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import { ChartCard } from './ChartCard'
import { AXIS_TEXT, GRID_LINE, TOOLTIP_STYLE, seriesColor } from './chartTheme'
import type { SeriesDef } from './chartTheme'

interface BarCompareProps {
  title: string
  subtitle?: string
  data: Array<Record<string, string | number>>
  xKey: string
  series: SeriesDef[]
  stacked?: boolean
  horizontal?: boolean
  height?: number
}

export function BarCompare({
  title,
  subtitle,
  data,
  xKey,
  series,
  stacked = false,
  horizontal = false,
  height = 220,
}: BarCompareProps) {
  const tick = { fill: AXIS_TEXT, fontSize: 11 }

  return (
    <ChartCard title={title} subtitle={subtitle} empty={data.length === 0}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout={horizontal ? 'vertical' : 'horizontal'}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <CartesianGrid stroke={GRID_LINE} vertical={horizontal} horizontal={!horizontal} />
            {horizontal ? (
              <>
                <XAxis type="number" tick={tick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey={xKey} tick={tick} tickLine={false} axisLine={false} width={72} />
              </>
            ) : (
              <>
                <XAxis dataKey={xKey} tick={tick} tickLine={false} axisLine={false} />
                <YAxis tick={tick} tickLine={false} axisLine={false} width={40} />
              </>
            )}
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
            {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={seriesColor(s, i)}
                stackId={stacked ? 'a' : undefined}
                radius={stacked ? 0 : [4, 4, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
