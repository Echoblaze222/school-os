'use client';

import type { ReactNode } from 'react';

/**
 * Scopes the validated categorical palette + chart chrome as CSS variables.
 * Light/dark values are selected steps (not an automatic flip); dark follows
 * the OS setting unless the app stamps data-theme="light|dark" on <html>.
 * Series colour follows the entity (fixed slot order), never its rank.
 */
const CSS = `
.viz-root{
  color-scheme:light;
  --viz-surface:#fcfcfb; --viz-ink:#0b0b0b; --viz-ink-2:#52514e; --viz-muted:#898781;
  --viz-grid:#e1e0d9; --viz-axis:#c3c2b7;
  --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a; --series-4:#eda100;
  --series-5:#e87ba4; --series-6:#008300; --series-7:#6250d6; --series-8:#e34948;
  --viz-gray:#c3c2b7; --viz-good:#006300; --viz-bad:#d03b3b;
}
@media (prefers-color-scheme: dark){
  :root:where(:not([data-theme="light"])) .viz-root{
    color-scheme:dark;
    --viz-surface:#1a1a19; --viz-ink:#f0efec; --viz-ink-2:#c3c2b7; --viz-muted:#898781;
    --viz-grid:#2c2c2a; --viz-axis:#383835;
    --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; --series-4:#c98500;
    --series-5:#d55181; --series-6:#008300; --series-7:#9085e9; --series-8:#e66767;
    --viz-gray:#383835; --viz-good:#0ca30c; --viz-bad:#e66767;
  }
}
:root[data-theme="dark"] .viz-root{
  color-scheme:dark;
  --viz-surface:#1a1a19; --viz-ink:#f0efec; --viz-ink-2:#c3c2b7; --viz-muted:#898781;
  --viz-grid:#2c2c2a; --viz-axis:#383835;
  --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70; --series-4:#c98500;
  --series-5:#d55181; --series-6:#008300; --series-7:#9085e9; --series-8:#e66767;
  --viz-gray:#383835; --viz-good:#0ca30c; --viz-bad:#e66767;
}
.viz-root{ font-family:system-ui,-apple-system,"Segoe UI",sans-serif; }
.viz-root .viz-fade{ transition:opacity .15s ease; }

/* ---- Glass skin (inspired by frosted-glass dashboards) ---- */
.viz-root{ position:relative; isolation:isolate; }
/* The glow stays inside the section's own box (it used to bleed 24px above
   and 12px past each side, drawing over the banner above and the page
   margins). */
.viz-root::before{
  content:""; position:absolute; inset:0; z-index:-1; pointer-events:none; border-radius:28px;
  background:
    radial-gradient(420px 280px at 8% 0%, color-mix(in srgb, var(--series-4) 26%, transparent), transparent 70%),
    radial-gradient(480px 320px at 95% 12%, color-mix(in srgb, var(--series-1) 20%, transparent), transparent 70%),
    radial-gradient(520px 340px at 40% 100%, color-mix(in srgb, var(--series-3) 18%, transparent), transparent 70%);
  filter:blur(8px);
}
.viz-root .glass-card{
  background:linear-gradient(145deg, color-mix(in srgb, var(--viz-surface) 62%, transparent), color-mix(in srgb, var(--viz-surface) 34%, transparent));
  -webkit-backdrop-filter:blur(18px) saturate(160%); backdrop-filter:blur(18px) saturate(160%);
  border:1px solid color-mix(in srgb, #fff 38%, transparent);
  box-shadow:inset 0 1px 0 color-mix(in srgb, #fff 55%, transparent), 0 8px 28px rgba(20,16,10,.10);
  border-radius:20px;
  transition:transform .28s cubic-bezier(.2,.8,.2,1), box-shadow .28s ease;
  animation:viz-rise .6s cubic-bezier(.2,.8,.2,1) both;
}
/* Hover lift only where a real pointer exists; on touch screens :hover sticks
   after a tap and left cards stuck in the lifted position. */
@media (hover:hover){
  .viz-root .glass-card:hover{ transform:translateY(-5px); box-shadow:inset 0 1px 0 color-mix(in srgb, #fff 60%, transparent), 0 16px 38px rgba(20,16,10,.16); }
}
.viz-root .glass-card:nth-child(2){ animation-delay:.06s } .viz-root .glass-card:nth-child(3){ animation-delay:.12s }
.viz-root .glass-card:nth-child(4){ animation-delay:.18s } .viz-root .glass-card:nth-child(5){ animation-delay:.24s }
.viz-root .glass-card:nth-child(6){ animation-delay:.30s } .viz-root .glass-card:nth-child(n+7){ animation-delay:.36s }
.viz-root .viz-delta{ display:inline-flex; align-items:center; gap:3px; font-size:11px; font-weight:600; padding:2px 8px; border-radius:999px;
  color:var(--viz-ink); background:color-mix(in srgb, var(--series-3) 22%, transparent); }
.viz-root .viz-delta.down{ background:color-mix(in srgb, var(--series-2) 22%, transparent); }
@keyframes viz-rise{ from{ opacity:0; transform:translateY(14px) scale(.985) } to{ opacity:1; transform:none } }
@media (max-width:640px){
  .viz-root .glass-card{ -webkit-backdrop-filter:blur(10px) saturate(140%); backdrop-filter:blur(10px) saturate(140%); }
  .viz-root::before{ filter:none; }
}
@media (prefers-reduced-motion: reduce){
  .viz-root .glass-card{ animation:none; transition:none; }
  .viz-root .glass-card:hover{ transform:none; }
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
