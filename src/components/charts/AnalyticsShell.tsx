'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Sparkline } from './Sparkline';

/** Calls a Postgres analytics RPC. Keeps the previous result while refetching (no skeleton flash). */
export function useRpc<T = any>(fn: string, args?: Record<string, any>) {
  const supabase = useMemo(() => createClient(), []);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const key = JSON.stringify(args ?? {});

  useEffect(() => {
    let live = true;
    setBusy(true);
    supabase.rpc(fn, args ?? {}).then(({ data: d, error: e }: any) => {
      if (!live) return;
      if (e) setError(e.message);
      else { setError(null); setData(d as T); }
      setBusy(false);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, fn, key]);

  return { data, error, loading: busy && data == null, refreshing: busy && data != null };
}

export function Chip({ active, onClick, children, brand }: { active: boolean; onClick: () => void; children: ReactNode; brand: string }) {
  return (
    <button
      className="pressable"
      onClick={onClick}
      aria-pressed={active}
      style={{
        padding: '6px 14px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
        background: active ? brand : 'var(--glass-bg)', color: active ? '#fff' : 'var(--text-muted)',
        border: active ? `1px solid ${brand}` : '1px solid var(--glass-border)',
      }}
    >
      {children}
    </button>
  );
}

/** Stat tile: label, proportional-figure value, optional note + sparkline. */
export function Stat({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number[] }) {
  return (
    <div className="glass-card" style={{ padding: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 8 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--text-primary)', lineHeight: 1.15 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      {trend && <Sparkline values={trend} />}
    </div>
  );
}

export function StatGrid({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 12 }}>{children}</div>;
}

/** One filter row above the content it scopes. */
export function FilterRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', overflowX: 'auto' }}>{children}</div>;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" style={{ padding: 12, borderRadius: 10, fontSize: 13, color: 'var(--danger)', border: '1px solid var(--glass-border)' }}>
      Couldn’t load analytics: {message}
    </div>
  );
}

/** Plain table for ranked lists (e.g. top debtors). */
export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div style={{ overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr>{columns.map(c => <th key={c} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--glass-border)' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j} style={{ padding: '6px 8px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--glass-border)' }}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const gridStyle = { display: 'grid', gap: 'var(--space-4)' } as const;
