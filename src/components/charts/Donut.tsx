'use client';

import { useState } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { SERIES } from './ChartTheme';
import { ChartTooltip } from './TrendArea';

export interface Slice { label: string; value: number; slot?: number }

interface Props {
  data: Slice[];
  valueFormat?: (v: number) => string;
  /** Centre caption, e.g. the total. */
  centerValue?: string;
  centerLabel?: string;
  height?: number;
}

/** Part-to-whole at a glance. Keep to <= 6 slices; fold the tail into "Other". */
export function Donut({ data, valueFormat, centerValue, centerLabel, height = 200 }: Props) {
  const [active, setActive] = useState<number | null>(null);
  const total = data.reduce((a, d) => a + d.value, 0);
  const colorOf = (i: number) => SERIES[(data[i].slot ?? i) % SERIES.length];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16 }}>
      <div style={{ position: 'relative', width: height, height, flexShrink: 0 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie
              data={data} dataKey="value" nameKey="label" innerRadius="64%" outerRadius="100%"
              paddingAngle={2} stroke="var(--viz-surface)" strokeWidth={2} startAngle={90} endAngle={-270}
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)}
            >
              {data.map((d, i) => (
                <Cell key={d.label} fill={colorOf(i)} fillOpacity={active == null || active === i ? 1 : 0.5} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueFormat={valueFormat} />} />
          </PieChart>
        </ResponsiveContainer>
        {centerValue && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
            <div>
              <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--viz-ink)' }}>{centerValue}</div>
              {centerLabel && <div style={{ fontSize: 11, color: 'var(--viz-muted)' }}>{centerLabel}</div>}
            </div>
          </div>
        )}
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 8, fontSize: 12, color: 'var(--viz-ink-2)', flex: 1, minWidth: 140 }}>
        {data.map((d, i) => (
          <li key={d.label} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: colorOf(i) }} />
              {d.label}
            </span>
            <span style={{ color: 'var(--viz-ink)', fontWeight: 600 }}>
              {valueFormat ? valueFormat(d.value) : d.value}
              <span style={{ color: 'var(--viz-muted)', fontWeight: 400 }}> · {total ? Math.round((d.value / total) * 100) : 0}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
