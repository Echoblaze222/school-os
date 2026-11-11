'use client'
// src/components/RouteLoading.tsx
//
// What a role's dashboard shows INSTANTLY when a link is tapped, while the
// next page's data is still travelling from the server. Before this, the
// whole screen turned into a full-screen spinner and the Menu / AI buttons
// vanished until the new page arrived, which on a slow connection reads as
// "the app froze". Now the bottom Menu / AI buttons stay put (they
// work immediately) and the page shows grey placeholder blocks shaped like
// a normal screen, so the tap feels acknowledged at once.
//
// Purely visual: no network calls, no user data, nothing cached.

import BottomDock from '@/components/BottomDock'
import type { FeatureGroup } from '@/components/AllFeaturesSheet'

interface Props {
  role:   string
  groups: FeatureGroup[]
  /** Defaults to `/dashboard/${role}/ai`, same as the real pages. */
  aiHref?: string
}

export default function RouteLoading({ role, groups, aiHref }: Props) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Loading"
      style={{
        minHeight: '100dvh',
        background: 'var(--bg-base, #080C14)',
        padding: 'var(--space-5, 20px)',
        paddingBottom: 120,
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4, 16px)',
      }}
    >
      {/* header band */}
      <div className="skeleton" style={{ height: 120, borderRadius: 'var(--radius-xl, 20px)' }} />
      {/* two stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12 }}>
        <div className="skeleton" style={{ height: 96, borderRadius: 'var(--radius-xl, 20px)' }} />
        <div className="skeleton" style={{ height: 96, borderRadius: 'var(--radius-xl, 20px)' }} />
      </div>
      {/* list rows */}
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-xl, 20px)' }} />
      ))}

      <BottomDock aiHref={aiHref ?? `/dashboard/${role}/ai`} groups={groups} role={role} />
    </div>
  )
}
