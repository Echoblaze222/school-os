'use client';

import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { AXIS_TICK, SERIES } from './ChartTheme';

export interface TrendSeries {
  key: string;
  label: string;
  /** Fixed slot index into the categorical palette (colour follows the entity). */
  slot?: number;
}

interface Props {
  data: Record<string, any>[];
  xKey: string;
  series: TrendSeries[];
  xFormat?: (v: any) => string;
  yFormat?: (v: number) => string;
  /** Tooltip value formatter (full precision). */
  valueFormat?: (v: number) => string;
  yDomain?: [number | 'auto', number | 'auto'];
  /** Optional reference line (e.g. a target). */
  target?: { value: number; label: string };
  height?: number;
}

export function ChartTooltip({ active, payload, label, xFormat, valueFormat, colors }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--viz-surface)', border: '1px solid var(--viz-grid)', borderRadius: 10,
      padding: '8px 10px', boxShadow: '0 6px 20px rgba(0,0,0,.12)', fontSize: 12, minWidth: 120,
    }}>
      <div style={{ color: 'var(--viz-ink-2)', marginBottom: 4 }}>{xFormat ? xFormat(label) : label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--viz-ink-2)' }}>
            <span aria-hidden style={{ width: 10, height: 2, borderRadius: 1, background: colors?.[p.dataKey] ?? p.color }} />
            {p.name}
          </span>
          <strong style={{ color: 'var(--viz-ink)', fontWeight: 600 }}>
            {valueFormat ? valueFormat(p.value) : p.value}
          </strong>
        </div>
      ))}
    </div>
  );
}

export function TrendArea({
  data, xKey, series, xFormat, yFormat, valueFormat, yDomain, target, height = 240,
}: Props) {
  const colors: Record<string, string> = {};
  series.forEach((s, i) => { colors[s.key] = SERIES[(s.slot ?? i) % SERIES.length]; });
  const single = series.length === 1;
  const Chart: any = single ? AreaChart : LineChart;

  return (
    <div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer>
          <Chart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" strokeWidth={1} />
            <XAxis dataKey={xKey} tick={AXIS_TICK} tickFormatter={xFormat} axisLine={{ stroke: 'var(--viz-axis)' }} tickLine={false} minTickGap={24} />
            <YAxis tick={AXIS_TICK} tickFormatter={yFormat} axisLine={false} tickLine={false} width={44} domain={yDomain ?? ['auto', 'auto']} />
            <Tooltip
              cursor={{ stroke: 'var(--viz-axis)', strokeWidth: 1 }}
              content={<ChartTooltip xFormat={xFormat} valueFormat={valueFormat} colors={colors} />}
            />
            {target && (
              <ReferenceLine y={target.value} stroke="var(--viz-muted)" strokeWidth={1}
                label={{ value: target.label, fill: 'var(--viz-muted)', fontSize: 11, position: 'insideTopRight' }} />
            )}
            {series.map(s =>
              single ? (
                <Area key={s.key} type="monotone" dataKey={s.key} name={s.label}
                  stroke={colors[s.key]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  fill={colors[s.key]} fillOpacity={0.1}
                  dot={false} activeDot={{ r: 4, fill: colors[s.key], stroke: 'var(--viz-surface)', strokeWidth: 2 }} />
              ) : (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label}
                  stroke={colors[s.key]} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                  dot={false} activeDot={{ r: 4, fill: colors[s.key], stroke: 'var(--viz-surface)', strokeWidth: 2 }} />
              ),
            )}
          </Chart>
        </ResponsiveContainer>
      </div>
      {!single && <Legend items={series.map(s => ({ label: s.label, color: colors[s.key] }))} line />}
    </div>
  );
}

export function Legend({ items, line }: { items: { label: string; color: string }[]; line?: boolean }) {
  return (
    <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', listStyle: 'none', margin: '8px 0 0', padding: 0, fontSize: 12, color: 'var(--viz-ink-2)' }}>
      {items.map(i => (
        <li key={i.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span aria-hidden style={{ width: line ? 12 : 10, height: line ? 2 : 10, borderRadius: line ? 1 : 2, background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}
