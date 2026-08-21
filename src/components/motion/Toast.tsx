'use client'

// Reusable toast - a drop-in replacement for the inline toast state/JSX
// that many screens (bursar Claims, etc.) previously hand-rolled with
// slightly different timing and no enter/exit animation. Local hook, no
// context/provider wiring required, so it's safe to adopt one screen at a
// time without touching the root layout.
//
// Usage:
//   const { toast, showToast } = useToast()
//   showToast('Payment confirmed')
//   ...
//   <Toast toast={toast} />

import { useRef, useState, useCallback } from 'react'

export interface ToastState {
  message: string
  leaving: boolean
  key: number
}

export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])

  const showToast = useCallback((message: string, durationMs = 3200) => {
    timers.current.forEach(clearTimeout)
    timers.current = []
    const key = Date.now()
    setToast({ message, leaving: false, key })
    timers.current.push(
      setTimeout(() => setToast(t => (t && t.key === key ? { ...t, leaving: true } : t)), durationMs),
      setTimeout(() => setToast(t => (t && t.key === key ? null : t)), durationMs + 300),
    )
  }, [])

  return { toast, showToast }
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null
  return (
    <div
      key={toast.key}
      className={toast.leaving ? 'animate-toast-out' : 'animate-toast-in'}
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', top: 80, left: '50%', zIndex: 999,
        background: '#1a1a2e', color: '#fff', padding: '10px 20px',
        borderRadius: 10, fontSize: '0.82rem', boxShadow: '0 4px 20px #0008',
        border: '1px solid var(--glass-border)', maxWidth: '90vw', textAlign: 'center',
      }}
    >
      {toast.message}
    </div>
  )
}
