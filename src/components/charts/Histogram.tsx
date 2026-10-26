'use client'

import { useMemo } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { ChartCard } from './ChartCard'
import { AXIS_TEXT, GRID_LINE, TOOLTIP_STYLE, CHART_COLORS } from './chartTheme'

export interface Bin {
  label: string
  count: number
}

export function buildBins(values: number[], min: number, max: number, binCount: number): Bin[] {
  const width = (max - min) / binCount
  const bins: Bin[] = Array.from({ length: binCount }, (_, i) => {
    const lo = Math.round(min + i * width)
    const hi = Math.round(min + (i + 1) * width)
    return { label: lo + '-' + hi, count: 0 }
  })
  for (const v of values) {
    if (!Number.isFinite(v) || v < min || v > max) continue
    const idx = Math.min(binCount - 1, Math.floor((v - min) / width))
    bins[idx].count += 1
  }
  return bins
}

interface HistogramProps {
  title: string
  subtitle?: string
  values: number[]
  min?: number
  max?: number
  bins?: number
  height?: number
}

export function Histogram({
  title,
  subtitle,
  values,
  min = 0,
  max = 100,
  bins = 10,
  height = 220,
}: HistogramProps) {
  const data = useMemo(() => buildBins(values, min, max, bins), [values, min, max, bins])

  return (
    <ChartCard title={title} subtitle={subtitle} empty={values.length === 0}>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barCategoryGap={2} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID_LINE} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: AXIS_TEXT, fontSize: 10 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fill: AXIS_TEXT, fontSize: 11 }} tickLine={false} axisLine={false} width={32} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(128,128,128,0.1)' }} />
            <Bar dataKey="count" name="Students" fill={CHART_COLORS[0]} radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
