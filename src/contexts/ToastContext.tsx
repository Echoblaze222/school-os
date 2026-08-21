'use client'

// src/contexts/ToastContext.tsx
//
// The centralized toast engine §57 asks for — one place, mounted once
// at the root layout, instead of each page hand-rolling its own toast
// state (19 files did this before Lane 3; src/components/motion/Toast.tsx's
// local useToast() hook, adopted by 7 of them, is the closest prior art
// and stays as-is — this doesn't replace it, existing callers of that
// hook are unaffected. New code should prefer this one; it's the only
// one with severity variants, dedup, and action buttons.)
//
// Usage from any client component, anywhere in the tree:
//   import { useToast } from '@/contexts/ToastContext'
//   const { showToast } = useToast()
//   showToast({ message: 'Payment recorded successfully.', variant: 'success' })
//   showToast({
//     message: 'Failed to update attendance.', variant: 'error',
//     action: { label: 'Retry', onClick: () => retryFn() },
//   })

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

export type ToastVariant = 'success' | 'error' | 'warning' | 'info' | 'loading'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface ShowToastInput {
  message: string
  variant?: ToastVariant
  /** ms before auto-dismiss. Ignored for 'loading' (stays until updateToast/dismissToast is called). Defaults scale by severity — errors stay up longer than routine success. */
  durationMs?: number
  action?: ToastAction
  /** A second, lower-emphasis action — e.g. "View" alongside a primary "Retry". */
  secondaryAction?: ToastAction
  /** Two calls with the same dedupeKey within the window collapse into one toast instead of stacking duplicates (e.g. the same failed-save error firing from two effects). */
  dedupeKey?: string
}

interface ActiveToast extends ShowToastInput {
  id: number
  leaving: boolean
}

interface ToastContextValue {
  showToast: (input: ShowToastInput) => number
  /** Update an in-flight toast in place — e.g. flip a 'loading' toast to 'success' once an async action resolves, instead of showing two separate toasts. */
  updateToast: (id: number, input: ShowToastInput) => void
  dismissToast: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const DEFAULT_DURATION: Record<ToastVariant, number> = {
  success: 3200,
  info:    3200,
  warning: 4500,
  error:   6000,
  loading: Infinity, // stays until explicitly updated/dismissed
}

const DEDUPE_WINDOW_MS = 2000
const MAX_STACKED = 3 // §57: "no excessive stacking" — oldest is dropped once exceeded

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ActiveToast[]>([])
  const nextId = useRef(1)
  const recentDedupeKeys = useRef<Map<string, number>>(new Map())
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>[]>>(new Map())

  const clearTimers = useCallback((id: number) => {
    timers.current.get(id)?.forEach(clearTimeout)
    timers.current.delete(id)
  }, [])

  const scheduleDismiss = useCallback((id: number, durationMs: number) => {
    if (!isFinite(durationMs)) return
    const leaveTimer = setTimeout(() => {
      setToasts(t => t.map(x => (x.id === id ? { ...x, leaving: true } : x)))
    }, durationMs)
    const removeTimer = setTimeout(() => {
      setToasts(t => t.filter(x => x.id !== id))
      clearTimers(id)
    }, durationMs + 250)
    timers.current.set(id, [leaveTimer, removeTimer])
  }, [clearTimers])

  const showToast = useCallback((input: ShowToastInput): number => {
    const variant = input.variant ?? 'info'

    if (input.dedupeKey) {
      const lastShown = recentDedupeKeys.current.get(input.dedupeKey)
      if (lastShown && Date.now() - lastShown < DEDUPE_WINDOW_MS) {
        return -1 // suppressed — identical event fired again within the window
      }
      recentDedupeKeys.current.set(input.dedupeKey, Date.now())
    }

    const id = nextId.current++
    const durationMs = input.durationMs ?? DEFAULT_DURATION[variant]

    setToasts(t => {
      const next = [...t, { ...input, variant, id, leaving: false }]
      // Drop the oldest beyond MAX_STACKED rather than letting the
      // stack grow unbounded during a burst of events.
      return next.length > MAX_STACKED ? next.slice(next.length - MAX_STACKED) : next
    })

    scheduleDismiss(id, durationMs)
    return id
  }, [scheduleDismiss])

  const updateToast = useCallback((id: number, input: ShowToastInput) => {
    clearTimers(id)
    const variant = input.variant ?? 'info'
    const durationMs = input.durationMs ?? DEFAULT_DURATION[variant]
    setToasts(t => t.map(x => (x.id === id ? { ...x, ...input, variant, leaving: false } : x)))
    scheduleDismiss(id, durationMs)
  }, [clearTimers, scheduleDismiss])

  const dismissToast = useCallback((id: number) => {
    clearTimers(id)
    setToasts(t => t.map(x => (x.id === id ? { ...x, leaving: true } : x)))
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 250)
  }, [clearTimers])

  return (
    <ToastContext.Provider value={{ showToast, updateToast, dismissToast }}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismissToast} />
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>')
  return ctx
}

const VARIANT_STYLE: Record<ToastVariant, { border: string; icon: string }> = {
  success: { border: 'var(--success)', icon: '✓' },
  error:   { border: 'var(--danger)',  icon: '✕' },
  warning: { border: 'var(--warning)', icon: '⚠' },
  info:    { border: 'var(--info)',    icon: 'ℹ' },
  loading: { border: 'var(--gold)',    icon: '⟳' },
}

function ToastViewport({ toasts, onDismiss }: { toasts: ActiveToast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null

  return (
    // aria-live="polite" region announces new toasts to screen readers
    // without interrupting whatever they're currently reading (§57:
    // "accessible announcements for screen readers"). One shared
    // region for the whole stack, not one per toast, so a burst of
    // toasts doesn't fire a burst of separate announcements.
    <div
      aria-live="polite"
      role="status"
      style={{
        position: 'fixed', zIndex: 999,
        top: 'max(env(safe-area-inset-top), 16px)',
        left: '50%', transform: 'translateX(-50%)',
        display: 'flex', flexDirection: 'column', gap: 'var(--space-2)',
        width: 'min(92vw, 420px)', pointerEvents: 'none',
      }}
    >
      {toasts.map(t => (
        <ToastItem key={t.id} toast={t} onDismiss={() => onDismiss(t.id)} />
      ))}
    </div>
  )
}

function ToastItem({ toast, onDismiss }: { toast: ActiveToast; onDismiss: () => void }) {
  const style = VARIANT_STYLE[toast.variant ?? 'info']

  return (
    <div
      className={toast.leaving ? 'animate-toast-item-out' : 'animate-toast-item-in'}
      style={{
        pointerEvents: 'auto',
        display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)',
        background: '#1a1a2e', color: '#fff',
        padding: 'var(--space-3) var(--space-4)',
        borderRadius: 'var(--radius-md)',
        borderLeft: `3px solid ${style.border}`,
        boxShadow: '0 4px 20px #0008',
        fontSize: '0.85rem', lineHeight: 1.4,
      }}
    >
      <span aria-hidden="true" style={{ color: style.border, fontWeight: 700, flexShrink: 0 }}>
        {toast.variant === 'loading'
          ? <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>{style.icon}</span>
          : style.icon}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div>{toast.message}</div>
        {(toast.action || toast.secondaryAction) && (
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                style={{ background: 'none', border: 'none', color: style.border, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
              >
                {toast.action.label}
              </button>
            )}
            {toast.secondaryAction && (
              <button
                onClick={toast.secondaryAction.onClick}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: '0.8rem', cursor: 'pointer', padding: 0 }}
              >
                {toast.secondaryAction.label}
              </button>
            )}
          </div>
        )}
      </div>

      {toast.variant !== 'loading' && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss notification"
          style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: 0, fontSize: '1rem', lineHeight: 1, flexShrink: 0 }}
        >
          ×
        </button>
      )}
    </div>
  )
}
