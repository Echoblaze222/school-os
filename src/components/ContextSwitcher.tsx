'use client'
// src/components/ContextSwitcher.tsx
// §23: lets a user with multiple authorized contexts move between them.
// This component only ever renders links built from /api/me/contexts :
// it holds no authorization logic itself. See that route's header
// comment for why switching context here can't be mistaken for a grant
// of access: every destination page independently re-checks server-side.
//
// Renders nothing if the user only has one context (their base role) :
// a switcher with one option is just noise.
//
// Uses a plain <a>, not next/link : switching context is a fresh
// auth-adjacent transition between fundamentally different role
// dashboards, the same class of situation login.tsx and
// onboarding/stage-3 already use window.location for. The client
// Router Cache doesn't reset on this kind of transition, so a soft
// nav here could serve a stale cached render of the destination
// (e.g. a missing avatar, stale stats) instead of a fresh one - with
// no way for the user to force a refresh from inside a native app
// shell. A real anchor tag isn't intercepted by the client router, so
// every context switch is a genuine full navigation.

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import styles from './ContextSwitcher.module.css'

interface Context { id: string; label: string; href: string; kind: 'base' | 'appointment' | 'boarding' }

export default function ContextSwitcher() {
  const pathname = usePathname()
  const [contexts, setContexts] = useState<Context[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/me/contexts')
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => { if (!cancelled) setContexts(data.contexts ?? []) })
      .catch(() => { if (!cancelled) setContexts([]) })
    return () => { cancelled = true }
  }, [])

  // Loading, errored, or single-context: render nothing rather than a
  // switcher that has nothing to switch to.
  if (!contexts || contexts.length <= 1) return null

  return (
    <div className={styles.switcher} role="tablist" aria-label="Switch dashboard context">
      {contexts.map(ctx => {
        const active = pathname === ctx.href || (ctx.href !== '/dashboard' && pathname?.startsWith(ctx.href.split('?')[0]))
        return (
          <a
            key={ctx.id}
            href={ctx.href}
            role="tab"
            aria-selected={active}
            className={`${styles.pill} ${active ? styles.pillActive : ''}`}
          >
            {ctx.label}
          </a>
        )
      })}
    </div>
  )
}
