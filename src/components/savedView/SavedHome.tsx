'use client'
// src/components/savedView/SavedHome.tsx
//
// Shown instead of the grey placeholders when a staff member taps Home and a
// copy of their last-seen Home summary is saved on this phone. Paints their
// headline numbers instantly while the real page is on its way.
//
// Display-only and non-interactive; makes no network calls (it reads only the
// session the phone already holds, to confirm the saved copy belongs to the
// person using the phone). Clearly marked as a saved copy. See
// student/StudentHomeSaved.tsx for the student version and the privacy rules
// in lib/savedView/store.ts.

import { useEffect, useState } from 'react'
import BottomDock from '@/components/BottomDock'
import RouteLoading from '@/components/RouteLoading'
import type { FeatureGroup } from '@/components/AllFeaturesSheet'
import { currentUserId } from '@/lib/savedView/currentUserId'
import { loadView } from '@/lib/savedView/store'
import { HOME_SNAPSHOT_VERSION, homeKey, type HomeSnapshot } from './homeSnapshot'

interface Props {
  role:   string
  groups: FeatureGroup[]
}

export default function SavedHome({ role, groups }: Props) {
  const [snap, setSnap] = useState<HomeSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const uid = await currentUserId()
      if (!uid) return
      const saved = await loadView<HomeSnapshot>(uid, homeKey(role))
      if (!cancelled && saved && saved.data?.v === HOME_SNAPSHOT_VERSION) setSnap(saved.data)
    })()
    return () => { cancelled = true }
  }, [role])

  // Nothing saved (first ever visit, expired, different user): plain placeholders.
  if (!snap) return <RouteLoading role={role} groups={groups} />

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div
      aria-busy="true"
      style={{ minHeight: '100dvh', background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))', paddingBottom: 120 }}
    >
      <div
        role="status"
        style={{
          position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          padding: '8px 12px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
          border: '1px solid var(--glass-border)', boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
        }}
      >
        Saved copy · updating…
      </div>

      {/* Not interactive: it is a picture of the last screen, not live data. */}
      <div style={{ pointerEvents: 'none' }}>
        <div
          style={{
            padding: '52px var(--space-5) 28px',
            background: `linear-gradient(135deg, color-mix(in srgb, ${snap.schoolColor} 70%, #000), var(--brand-dark))`,
            color: '#F6F1E4',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8 }}>{greeting}, {snap.firstName}</p>
          <p style={{ margin: '8px 0 4px', fontSize: '1.2rem', fontWeight: 800 }}>{snap.headline}</p>
          <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8 }}>{snap.schoolName}</p>
        </div>

        <main style={{ padding: 'var(--space-6) var(--space-5) 0', maxWidth: 720, margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {snap.tiles.map((t) => (
              <div
                key={t.label}
                className="glass-card-flat"
                style={{ padding: '16px 16px', borderRadius: 'var(--radius-lg)', display: 'flex', flexDirection: 'column', gap: 4 }}
              >
                <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--text-muted)' }}>{t.label}</p>
                <p style={{ margin: 0, fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>{t.value}</p>
              </div>
            ))}
          </div>
        </main>
      </div>

      <BottomDock aiHref={`/dashboard/${role}/ai`} groups={groups} role={role} />
    </div>
  )
}
