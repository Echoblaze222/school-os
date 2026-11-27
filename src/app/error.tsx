'use client'
// src/app/error.tsx
// Catches a crash in any page below the root layout. Before this file existed the app
// fell back to Next.js's generic "This page couldn't load" screen.
//
// Offline case: tapping a link while offline makes Next fetch the next page's data,
// which cannot work, and the page can end up here. A FULL page load is different:
// public/sw.js answers it with the screen's offline twin (or /offline). So when the
// phone is offline, reload the URL once. Guarded so it can never loop.

import { useEffect, useState } from 'react'

const RELOAD_KEY = 'schoolos_error_reload_at'
const RELOAD_GUARD_MS = 15_000

function reloadedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
    return Date.now() - at < RELOAD_GUARD_MS
  } catch {
    // No sessionStorage: do not risk a reload loop.
    return true
  }
}

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)

  useEffect(() => {
    console.error('[route error]', error)
    if (typeof navigator === 'undefined' || navigator.onLine !== false) return
    if (reloadedRecently()) return
    try {
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    } catch {
      return
    }
    window.location.reload()
  }, [error])

  return (
    <div
      role="alert"
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 24,
        textAlign: 'center',
        background: 'var(--bg-base, #0a0d14)',
        color: 'var(--text-primary, #f6f1e4)',
      }}
    >
      <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
        {offline ? 'No connection' : "This page couldn't load"}
      </h1>
      <p style={{ fontSize: '0.875rem', margin: 0, lineHeight: 1.6, maxWidth: 360, color: 'var(--text-muted, #9aa3b2)' }}>
        {offline
          ? 'You are offline. Pages you have already opened on this phone may still work. Connect and try again.'
          : 'Something went wrong while opening this page. Try again, or go back.'}
      </p>
      <div style={{ display: 'flex', gap: 10 }}>
        <button
          type="button"
          onClick={() => (offline ? window.location.reload() : reset())}
          style={{ padding: '12px 22px', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', background: 'var(--brand, #800020)', color: '#fff' }}
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.history.back()}
          style={{ padding: '12px 22px', borderRadius: 999, fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', background: 'transparent', color: 'inherit', border: '1px solid var(--glass-border, rgba(255,255,255,0.2))' }}
        >
          Back
        </button>
      </div>
    </div>
  )
}
