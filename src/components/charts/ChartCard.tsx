'use client';

import { useState, type ReactNode } from 'react';
import { SkeletonBlock } from '@/components/motion/Skeleton';

export interface TableView {
  columns: string[];
  rows: (string | number)[][];
}

interface Props {
  title: string;
  /** Insight-first headline: the finding, not a description of the chart. */
  insight?: string;
  subtitle?: string;
  loading?: boolean;
  /** True when there is nothing to plot. */
  empty?: boolean;
  emptyText?: string;
  /** Table-view twin of the chart (every chart has one). */
  table?: TableView;
  children: ReactNode;
}

export function ChartCard({ title, insight, subtitle, loading, empty, emptyText, table, children }: Props) {
  const [showTable, setShowTable] = useState(false);
  return (
    <section className="glass-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <h3 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>{title}</h3>
          {insight && !loading && (
            <p style={{ margin: '4px 0 0', fontSize: 16, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.3 }}>{insight}</p>
          )}
          {subtitle && <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>{subtitle}</p>}
        </div>
        {table && !empty && !loading && (
          <button
            type="button"
            className="btn"
            onClick={() => setShowTable(v => !v)}
            aria-pressed={showTable}
            style={{ fontSize: 11, padding: '4px 12px', flexShrink: 0 }}
          >
            {showTable ? 'Chart' : 'Table'}
          </button>
        )}
      </header>

      {loading ? (
        <SkeletonBlock style={{ height: 220, borderRadius: 12 }} />
      ) : empty ? (
        <div style={{ minHeight: 140, display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--text-muted)', textAlign: 'center' }}>
          {emptyText ?? 'Not enough data yet.'}
        </div>
      ) : showTable && table ? (
        <div style={{ overflow: 'auto', maxHeight: 320 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr>
                {table.columns.map(c => (
                  <th key={c} style={{ textAlign: 'left', padding: '8px 8px', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--glass-border)' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((v, j) => (
                    <td key={j} style={{ padding: '8px 8px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--glass-border)' }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
