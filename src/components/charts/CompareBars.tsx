'use client';

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_TICK, SERIES } from './ChartTheme';
import { ChartTooltip, Legend } from './TrendArea';

export interface BarSeries { key: string; label: string; slot?: number }

interface Props {
  data: Record<string, any>[];
  catKey: string;
  series: BarSeries[];
  /** Horizontal bars suit long / many category names. */
  horizontal?: boolean;
  stacked?: boolean;
  valueFormat?: (v: number) => string;
  axisFormat?: (v: number) => string;
  /** Emphasis: colour only this category, gray the rest (single series). */
  highlight?: string;
  /** Label the value at the bar tip (single series only). */
  tipLabels?: boolean;
  height?: number;
  domainMax?: number;
}

const BAR_MAX = 24; // marks never fill the slot
const GAP = 2;      // surface gap between touching marks

export function CompareBars({
  data, catKey, series, horizontal, stacked, valueFormat, axisFormat, highlight, tipLabels, height, domainMax,
}: Props) {
  const colors: Record<string, string> = {};
  series.forEach((s, i) => { colors[s.key] = SERIES[(s.slot ?? i) % SERIES.length]; });
  const single = series.length === 1;
  const h = height ?? (horizontal ? Math.max(180, data.length * 34 + 30) : 240);
  const radius: any = (horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]);

  return (
    <div>
      <div style={{ width: '100%', height: h }}>
        <ResponsiveContainer>
          <BarChart
            data={data}
            layout={horizontal ? 'vertical' : 'horizontal'}
            margin={{ top: 8, right: tipLabels ? 48 : 8, bottom: 0, left: 0 }}
            barCategoryGap="30%"
          >
            <CartesianGrid horizontal={!horizontal} vertical={!!horizontal} stroke="var(--viz-grid)" strokeWidth={1} />
            {horizontal ? (
              <>
                <XAxis type="number" tick={AXIS_TICK} tickFormatter={axisFormat} axisLine={false} tickLine={false} domain={[0, domainMax ?? 'auto']} />
                <YAxis type="category" dataKey={catKey} tick={AXIS_TICK} axisLine={{ stroke: 'var(--viz-axis)' }} tickLine={false} width={88} />
              </>
            ) : (
              <>
                <XAxis dataKey={catKey} tick={AXIS_TICK} axisLine={{ stroke: 'var(--viz-axis)' }} tickLine={false} interval={0} />
                <YAxis tick={AXIS_TICK} tickFormatter={axisFormat} axisLine={false} tickLine={false} width={44} domain={[0, domainMax ?? 'auto']} />
              </>
            )}
            <Tooltip
              cursor={{ fill: 'var(--viz-grid)', fillOpacity: 0.5 }}
              content={<ChartTooltip valueFormat={valueFormat} colors={colors} />}
            />
            {series.map((s, si) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                maxBarSize={BAR_MAX}
                stackId={stacked ? 'a' : undefined}
                radius={stacked ? (si === series.length - 1 ? radius : 0) : radius}
                fill={colors[s.key]}
                stroke="var(--viz-surface)"
                strokeWidth={stacked ? GAP / 2 : 0}
              >
                {single && highlight &&
                  data.map(d => (
                    <Cell key={String(d[catKey])} fill={d[catKey] === highlight ? colors[s.key] : 'var(--viz-gray)'} />
                  ))}
                {single && tipLabels && (
                  <LabelList
                    dataKey={s.key}
                    position={horizontal ? 'right' : 'top'}
                    formatter={(v: any) => (valueFormat ? valueFormat(Number(v)) : v)}
                    style={{ fill: 'var(--viz-ink-2)', fontSize: 11 }}
                  />
                )}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {!single && <Legend items={series.map(s => ({ label: s.label, color: colors[s.key] }))} />}
    </div>
  );
}
