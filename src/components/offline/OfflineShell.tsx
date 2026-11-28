'use client'
// src/components/offline/OfflineShell.tsx
// The frame around an offline twin page (src/app/offline/**). A twin is a page
// that contains NO user data in its HTML: it is the same for everyone, so it is
// safe to cache. This shell rebuilds the user's context on the phone itself:
//
//  - who: the last-known user id + the profile/school saved while online
//    (src/lib/offline/identity.ts), only for the right role;
//  - brand: the school's colours and font, applied from the saved school row with
//    the same palette code the online dashboards use (src/lib/brand);
//  - lock: the same auto-lock as the dashboard, and while locked NOTHING of the
//    user's data is rendered behind the lock screen;
//  - sync: queued changes upload as soon as the connection returns.
// If there is nothing saved for this phone it says so instead of guessing.

import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { useAutoLock } from '@/lib/useAutoLock'
import LockScreen from '@/components/auth/LockScreen'
import OfflineSyncBanner from '@/components/OfflineSyncBanner'
import { loadIdentity, readLastKnownUserId } from '@/lib/offline/identity'
import { applyBrandVars } from '@/lib/brand/applyBrand'

export interface ShellIdentity {
  userId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  profile: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  school: any
}

type State = { kind: 'loading' } | { kind: 'missing' } | { kind: 'ready'; identity: ShellIdentity }

export default function OfflineShell({
  role,
  children,
}: {
  /** Only a saved profile with this role may use the page. */
  role: string
  children: (identity: ShellIdentity) => ReactNode
}) {
  const [state, setState] = useState<State>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    ;(async () => {
      const userId = readLastKnownUserId()
      if (!userId) {
        if (active) setState({ kind: 'missing' })
        return
      }
      const saved = await loadIdentity(userId)
      if (!active) return
      if (saved?.profile && saved.profile.role === role) {
        setState({ kind: 'ready', identity: { userId, profile: saved.profile, school: saved.school } })
      } else {
        setState({ kind: 'missing' })
      }
    })()
    return () => {
      active = false
    }
  }, [role])

  const profile = state.kind === 'ready' ? state.identity.profile : null
  const school = state.kind === 'ready' ? state.identity.school : null
  const { locked, unlock } = useAutoLock({
    enabled: profile?.auto_lock_enabled ?? true,
    minutes: profile?.auto_lock_minutes ?? 10,
  })

  // Online, the dashboard layout injects the school's brand before first paint. Offline twins
  // live outside that layout, so apply the same variables from the saved school here, before
  // the first paint of the page (and for the lock screen too).
  useLayoutEffect(() => {
    if (!school) return
    return applyBrandVars(school)
  }, [school])

  if (state.kind === 'loading') return null

  if (state.kind === 'missing') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center', background: 'var(--bg-base)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Not ready for offline use</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6, maxWidth: 360 }}>
          Open this page once while you are online, signed in, and it will be available here next time. Saved pages are kept for 7 days.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{ padding: '12px 24px', background: 'linear-gradient(135deg,var(--brand),var(--brand-dark))', color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer' }}
        >
          Try again
        </button>
      </div>
    )
  }

  if (locked) return <LockScreen onUnlock={unlock} />

  return (
    <>
      {children(state.identity)}
      <OfflineSyncBanner userId={state.identity.userId} />
    </>
  )
}
