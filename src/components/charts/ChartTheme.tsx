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
