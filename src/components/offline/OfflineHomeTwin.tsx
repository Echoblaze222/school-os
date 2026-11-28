'use client'
// src/components/offline/OfflineHomeTwin.tsx
// The whole offline twin of a role's Home screen. A role's twin page is one line
// of setup: it gives the role and a render function that returns the SAME client
// component the online Home page uses, filled from what is saved on the phone.
//
//   <OfflineHomeTwin<TeacherHomeProps> role="teacher">
//     {({ userId, profile, school, saved }) => <TeacherDashboardClient ... />}
//   </OfflineHomeTwin>
//
// Handles: ?warm=1 (hidden-frame load so scripts get cached, renders nothing),
// the shell (identity, school brand, lock), loading the saved figures, a small
// "saved copy" label, and the message shown when nothing has been saved yet.

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react'
import OfflineShell, { type ShellIdentity } from '@/components/offline/OfflineShell'
import { loadHomeProps } from '@/lib/offline/homeProps'

interface Ctx<T> extends ShellIdentity {
  saved: T
}

// The address does not change while the page is open, so there is nothing to subscribe to.
function subscribeNothing(): () => void {
  return () => {}
}

function ago(ms: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - ms) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  return `${Math.floor(hrs / 24)} d ago`
}

function Inner<T>({ role, identity, children }: { role: string; identity: ShellIdentity; children: (ctx: Ctx<T>) => ReactNode }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'none' } | { kind: 'ok'; props: T; savedAt: number }>({ kind: 'loading' })

  useEffect(() => {
    let active = true
    void loadHomeProps<T>(identity.userId, role).then((res) => {
      if (!active) return
      setState(res ? { kind: 'ok', props: res.props, savedAt: res.savedAt } : { kind: 'none' })
    })
    return () => {
      active = false
    }
  }, [identity.userId, role])

  if (state.kind === 'loading') return null

  if (state.kind === 'none') {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, textAlign: 'center', background: 'var(--bg-base)' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>Home is not saved yet</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.6, maxWidth: 360 }}>
          Open your Home screen once while you are online. It will be here next time you are offline.
        </p>
      </div>
    )
  }

  return (
    <>
      <div
        role="status"
        style={{
          position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          padding: '6px 12px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
          border: '1px solid var(--glass-border)', boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
        }}
      >
        Offline copy · saved {ago(state.savedAt)}
      </div>
      {children({ ...identity, saved: state.props })}
    </>
  )
}

export default function OfflineHomeTwin<T>({
  role,
  children,
}: {
  role: string
  children: (ctx: Ctx<T>) => ReactNode
}) {
  // 'pending' while the page is being prerendered, then 'warm' or 'app' in the browser.
  const mode = useSyncExternalStore(
    subscribeNothing,
    () => (new URLSearchParams(window.location.search).has('warm') ? 'warm' : 'app'),
    () => 'pending',
  )

  if (mode !== 'app') return null

  return (
    <OfflineShell role={role}>
      {(identity) => (
        <Inner<T> role={role} identity={identity}>
          {children}
        </Inner>
      )}
    </OfflineShell>
  )
}
