'use client'
// src/app/global-error.tsx
// Last-resort error screen for crashes ABOVE src/app/error.tsx: the root layout
// and the providers in it (theme, toasts, back-button handler, status banner).
// error.tsx cannot catch those, so before this file existed Next.js showed its own
// plain white "This page couldn't load - Reload / Back" screen, which is not our code.
// You mostly saw it with mobile data off.
//
// This file replaces the root layout while it is showing, so it renders its own
// <html> and <body> and cannot rely on globals.css or CSS variables: colours are
// written out here on purpose.
//
// Offline: reload the URL once. A FULL page load is handled outside React: by
// public/sw.js in a browser (it shows the offline twin or /offline) and by
// server.errorPath (www/offline.html) in the Android app. Guarded with the same
// sessionStorage key as error.tsx, so the two can never reload in a loop.

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

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline] = useState(() => typeof navigator !== 'undefined' && navigator.onLine === false)

  useEffect(() => {
    console.error('[global error]', error)
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
    <html lang="en">
      <body style={{ margin: 0, background: '#080C14', color: '#f6f1e4', fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' }}>
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
          }}
        >
          <h1 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0 }}>
            {offline ? 'No connection' : "This page couldn't load"}
          </h1>
          <p style={{ fontSize: '0.875rem', margin: 0, lineHeight: 1.6, maxWidth: 360, color: '#9aa3b2' }}>
            {offline
              ? 'You are offline. Pages you have already opened on this phone may still work. Connect and try again.'
              : 'Something went wrong while opening this page. Try again, or go back.'}
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={() => (offline ? window.location.reload() : reset())}
              style={{ padding: '12px 22px', borderRadius: 999, border: 'none', fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', background: '#800020', color: '#fff' }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => window.history.back()}
              style={{ padding: '12px 22px', borderRadius: 999, fontWeight: 700, fontSize: '0.875rem', cursor: 'pointer', background: 'transparent', color: 'inherit', border: '1px solid rgba(255,255,255,0.2)' }}
            >
              Back
            </button>
          </div>
        </div>
      </body>
    </html>
  )
}
