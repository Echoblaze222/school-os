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

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
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
          <Link
            key={ctx.id}
            href={ctx.href}
            role="tab"
            aria-selected={active}
            className={`${styles.pill} ${active ? styles.pillActive : ''}`}
          >
            {ctx.label}
          </Link>
        )
      })}
    </div>
  )
}
