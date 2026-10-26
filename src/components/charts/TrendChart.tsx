'use client'

import {
  LineChart,
  Line,
  AreaChart,
  Area,
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

interface TrendChartProps {
  title: string
  subtitle?: string
  data: Array<Record<string, string | number>>
  xKey: string
  series: SeriesDef[]
  variant?: 'line' | 'area'
  height?: number
  yFormatter?: (v: number) => string
}

export function TrendChart({
  title,
  subtitle,
  data,
  xKey,
  series,
  variant = 'line',
  height = 220,
  yFormatter,
}: TrendChartProps) {
  const axes = (
    <>
      <CartesianGrid stroke={GRID_LINE} vertical={false} />
      <XAxis dataKey={xKey} tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={false} />
      <YAxis
        tick={{ fill: AXIS_TEXT, fontSize: 11 }}
        tickLine={false}
        axisLine={false}
        width={40}
        tickFormatter={yFormatter}
      />
      <Tooltip contentStyle={TOOLTIP_STYLE} />
      {series.length > 1 ? <Legend wrapperStyle={{ fontSize: 12 }} /> : null}
    </>
  )

  return (
    <ChartCard title={title} subtitle={subtitle} empty={data.length === 0}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          {variant === 'area' ? (
            <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {axes}
              {series.map((s, i) => (
                <Area
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={seriesColor(s, i)}
                  fill={seriesColor(s, i)}
                  fillOpacity={0.18}
                  strokeWidth={2}
                />
              ))}
            </AreaChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              {axes}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={seriesColor(s, i)}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
