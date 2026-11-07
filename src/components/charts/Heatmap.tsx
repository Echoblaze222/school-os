'use client';

import { useState } from 'react';
import { seq } from './ChartTheme';

export interface HeatCell { row: string; col: string; value: number | null }

interface Props {
  cells: HeatCell[];
  rows: string[];
  cols: string[];
  valueFormat?: (v: number) => string;
  /** Scale domain; defaults to data min/max. */
  min?: number;
  max?: number;
  /** Axis noun for the readout, e.g. "average". */
  measure?: string;
}

/** Class × subject (or any grid) magnitude map. One-hue sequential, with a scale legend. */
export function Heatmap({ cells, rows, cols, valueFormat = v => String(Math.round(v)), min, max, measure = 'value' }: Props) {
  const [hover, setHover] = useState<HeatCell | null>(null);
  const vals = cells.map(c => c.value).filter((v): v is number => v != null);
  const lo = min ?? Math.min(...vals);
  const hi = max ?? Math.max(...vals);
  const t = (v: number) => (hi === lo ? 0.5 : (v - lo) / (hi - lo));
  const byKey = new Map(cells.map(c => [`${c.row}|${c.col}`, c]));

  return (
    <div>
      <div style={{ overflowX: 'auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: `88px repeat(${cols.length}, minmax(44px, 1fr))`, gap: 2, minWidth: 88 + cols.length * 46 }}>
          <div />
          {cols.map(c => (
            <div key={c} style={{ fontSize: 11, color: 'var(--viz-muted)', textAlign: 'center', padding: '0 2px 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c}>{c}</div>
          ))}
          {rows.map(r => (
            <div key={r} style={{ display: 'contents' }}>
              <div style={{ fontSize: 12, color: 'var(--viz-ink-2)', alignSelf: 'center', whiteSpace: 'nowrap' }}>{r}</div>
              {cols.map(c => {
                const cell = byKey.get(`${r}|${c}`);
                const v = cell?.value ?? null;
                const tt = v == null ? 0 : t(v);
                const label = v == null ? `${r}, ${c}: no data` : `${r}, ${c}: ${valueFormat(v)} ${measure}`;
                return (
                  <div
                    key={c}
                    tabIndex={0}
                    role="img"
                    aria-label={label}
                    onPointerEnter={() => cell && setHover(cell)}
                    onPointerLeave={() => setHover(null)}
                    onFocus={() => cell && setHover(cell)}
                    onBlur={() => setHover(null)}
                    style={{
                      height: 30, borderRadius: 4, display: 'grid', placeItems: 'center', fontSize: 11,
                      background: v == null ? 'var(--viz-grid)' : seq(tt),
                      color: tt > 0.55 ? '#fff' : 'var(--viz-ink)',
                      outline: hover === cell && cell ? '2px solid var(--viz-ink)' : 'none', outlineOffset: -2,
                      cursor: 'default',
                    }}
                  >
                    {v == null ? '' : valueFormat(v)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 11, color: 'var(--viz-muted)' }}>
        <span>{valueFormat(lo)}</span>
        <span aria-hidden style={{ height: 8, width: 120, borderRadius: 4, background: `linear-gradient(90deg, ${seq(0)}, ${seq(1)})` }} />
        <span>{valueFormat(hi)}</span>
        <span style={{ marginLeft: 'auto', color: 'var(--viz-ink-2)', minHeight: 14 }} aria-live="polite">
          {hover && hover.value != null ? `${hover.row} · ${hover.col}: ${valueFormat(hover.value)}` : ''}
        </span>
      </div>
    </div>
  );
}
