'use client';

import type { ReactNode } from 'react';

/**
 * Scopes the validated categorical palette + chart chrome as CSS variables.
 * Surfaces/ink/grid now track the app's neutral tokens (white / #0F1623) so charts
 * sit flush on the dashboard; series hues stay the validated set. Colour is for
 * data identity only: no tinted backdrops, no decorative fills.
 */
const CSS = `
.viz-root{
  color-scheme:light;
  --viz-surface:#ffffff; --viz-ink:#0f1623; --viz-ink-2:#374151; --viz-muted:#6b7280;
  --viz-grid:#e5e7eb; --viz-axis:#c9cdd5;
  --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a; --series-4:#eda100;
  --series-5:#e87ba4; --series-6:#008300; --series-7:#6250d6; --series-8:#e34948;
  --viz-gray:#c9cdd5; --viz-good:#006300; --viz-bad:#d03b3b;
}
@media (prefers-color-scheme: dark){
  :root:where(:not([data-theme="light"])) .viz-root{
    color-scheme:dark;
    --viz-surface:#0f1623; --viz-ink:#f0f4ff; --viz-ink-2:#a8b4cc; --viz-muted:#8190ab;
    --viz-grid:#1f2a3d; --viz-axis:#2b3850;
    --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; --series-4:#c98500;
    --series-5:#d55181; --series-6:#008300; --series-7:#9085e9; --series-8:#e66767;
    --viz-gray:#3a465c; --viz-good:#0ca30c; --viz-bad:#e66767;
  }
}
:root[data-theme="dark"] .viz-root{
  color-scheme:dark;
  --viz-surface:#0f1623; --viz-ink:#f0f4ff; --viz-ink-2:#a8b4cc; --viz-muted:#8190ab;
  --viz-grid:#1f2a3d; --viz-axis:#2b3850;
  --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; --series-4:#c98500;
  --series-5:#d55181; --series-6:#008300; --series-7:#9085e9; --series-8:#e66767;
  --viz-gray:#3a465c; --viz-good:#0ca30c; --viz-bad:#e66767;
}
.viz-root{ font-family:inherit; }
.viz-root .viz-fade{ transition:opacity .15s ease; }

/* ---- Surface: solid, one hairline border, almost no shadow ---- */
.viz-root .glass-card{
  background:var(--viz-surface);
  border:1px solid var(--viz-grid);
  border-radius:16px;
  box-shadow:0 1px 2px rgba(15,22,35,.05);
  -webkit-backdrop-filter:none; backdrop-filter:none;
  transition:border-color .2s ease, box-shadow .2s ease;
  animation:viz-rise .4s cubic-bezier(.2,.8,.2,1) both;
}
.viz-root .glass-card:hover{ border-color:var(--viz-axis); box-shadow:0 4px 12px rgba(15,22,35,.08); }
.viz-root .glass-card:nth-child(2){ animation-delay:.04s } .viz-root .glass-card:nth-child(3){ animation-delay:.08s }
.viz-root .glass-card:nth-child(n+4){ animation-delay:.12s }
/* Change pill: neutral. Direction is the arrow, not a traffic-light colour. */
.viz-root .viz-delta{ display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px;
  color:var(--viz-ink-2); background:var(--viz-grid); }
@keyframes viz-rise{ from{ opacity:0; transform:translateY(8px) } to{ opacity:1; transform:none } }
@media (prefers-reduced-motion: reduce){
  .viz-root .glass-card{ animation:none; transition:none; }
}
`;

export function ChartTheme({ children }: { children: ReactNode }) {
  return (
    <div className="viz-root">
      <style>{CSS}</style>
      {children}
    </div>
  );
}

/** Fixed categorical order. Index by entity, never by rank. */
export const SERIES = [
  'var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)',
  'var(--series-5)', 'var(--series-6)', 'var(--series-7)', 'var(--series-8)',
];

/** One-hue sequential wash for magnitude: t in [0,1] -> lighter..darker blue. */
export function seq(t: number): string {
  const p = Math.round(12 + Math.max(0, Math.min(1, t)) * 88);
  return `color-mix(in srgb, var(--series-1) ${p}%, var(--viz-surface))`;
}

export const AXIS_TICK = { fill: 'var(--viz-muted)', fontSize: 11 } as const;
