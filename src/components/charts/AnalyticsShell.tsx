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
        padding: '8px 16px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
        background: active ? brand : 'transparent', color: active ? '#fff' : 'var(--text-secondary)',
        border: active ? `1px solid ${brand}` : '1px solid var(--glass-border)',
      }}
    >
      {children}
    </button>
  );
}

/** Count-up for the first number inside a formatted string (e.g. "₦1,250,000", "87%"). */
function useCountUp(text: string, ms = 900): string {
  const [out, setOut] = useState(text);
  useEffect(() => {
    const m = text.match(/-?\d[\d,]*\.?\d*/);
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!m || reduce) { setOut(text); return; }
    const raw = m[0];
    const target = parseFloat(raw.replace(/,/g, ''));
    if (!isFinite(target)) { setOut(text); return; }
    const dec = raw.includes('.') ? raw.split('.')[1].length : 0;
    const grouped = raw.includes(',');
    const pre = text.slice(0, m.index), post = text.slice((m.index ?? 0) + raw.length);
    let raf = 0; const t0 = performance.now();
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
      const v = target * e;
      const num = grouped ? v.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) : v.toFixed(dec);
      setOut(pre + num + post);
      if (k < 1) raf = requestAnimationFrame(step); else setOut(text);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [text, ms]);
  return out;
}

/** Stat tile: small muted label, one proportional-figure value, change pill, optional note + sparkline. */
export function Stat({ label, value, sub, trend }: { label: string; value: string; sub?: string; trend?: number[] }) {
  const shown = useCountUp(value);
  let delta: number | null = null;
  if (trend && trend.length >= 2 && trend[0] !== 0) delta = ((trend[trend.length - 1] - trend[0]) / Math.abs(trend[0])) * 100;
  return (
    <div className="glass-card" style={{ padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', color: 'var(--text-primary)', lineHeight: 1.2, margin: '8px 0 0', fontVariantNumeric: 'tabular-nums' }}>{shown}</div>
        {(delta !== null && Math.abs(delta) >= 0.1) || sub ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {delta !== null && Math.abs(delta) >= 0.1 && (
              <span className="viz-delta">{delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%</span>
            )}
            {sub && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</span>}
          </div>
        ) : null}
      </div>
      {trend && <Sparkline values={trend} />}
    </div>
  );
}

export function StatGrid({ children, min = 150 }: { children: ReactNode; min?: number }) {
  return <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`, gap: 16 }}>{children}</div>;
}

/** One filter row above the content it scopes. */
export function FilterRow({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', overflowX: 'auto' }}>{children}</div>;
}

export function ErrorNote({ message }: { message: string }) {
  return (
    <div role="alert" style={{ padding: 16, borderRadius: 12, fontSize: 13, color: 'var(--danger)', border: '1px solid var(--glass-border)' }}>
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
          <tr>{columns.map(c => <th key={c} style={{ textAlign: 'left', padding: '8px', color: 'var(--text-muted)', fontWeight: 500, borderBottom: '1px solid var(--glass-border)' }}>{c}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j} style={{ padding: '8px', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--glass-border)' }}>{v}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const gridStyle = { display: 'grid', gap: 16 } as const;
