'use client';

/** Tiny trend line for stat tiles: de-emphasis gray history, accent end-dot. */
export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pad = 5;
  const pts = values.map((v, i) => [
    pad + (i / (values.length - 1)) * (width - pad * 2),
    pad + (1 - (v - lo) / span) * (height - pad * 2),
  ]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg width={width} height={height} role="img" aria-label={`Trend, latest ${values[values.length - 1]}`}>
      <polyline points={pts.map(p => p.join(',')).join(' ')} fill="none" stroke="var(--viz-gray, #c3c2b7)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx} cy={ly} r={4} fill="var(--series-1, var(--brand))" stroke="var(--viz-surface, transparent)" strokeWidth={2} />
    </svg>
  );
}
