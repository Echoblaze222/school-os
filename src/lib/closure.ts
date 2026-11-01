// src/lib/closure.ts
//
// Pure helpers for school closure / remote-learning mode.

export const CLOSURE_MODES = ['closed', 'remote'] as const
export type ClosureMode = (typeof CLOSURE_MODES)[number]

export const CLOSURE_REASONS = [
  { id: 'security', label: 'Security concerns' },
  { id: 'weather',  label: 'Flooding or weather' },
  { id: 'health',   label: 'Health or outbreak' },
  { id: 'strike',   label: 'Strike or unrest' },
  { id: 'public',   label: 'Public holiday' },
  { id: 'other',    label: 'Other' },
] as const
export const CLOSURE_REASON_IDS: string[] = CLOSURE_REASONS.map(r => r.id)

export interface ClosureLike {
  mode: string
  reason: string
  starts_on: string
  expected_end_on: string | null
  active: boolean
}

/** Today's date (YYYY-MM-DD) in Nigeria (WAT, UTC+1), so a closure flips at local midnight. */
export function lagosToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' }).format(now)
}

/**
 * A closure is live when it is active, has started, and its expected end date
 * (if any) has not passed. The end-date rule means a forgotten closure stops
 * showing by itself.
 */
export function isClosureLive(c: ClosureLike, now: Date = new Date()): boolean {
  if (!c.active) return false
  const today = lagosToday(now)
  if (c.starts_on > today) return false
  if (c.expected_end_on && c.expected_end_on < today) return false
  return true
}

export function reasonLabel(id: string): string {
  return CLOSURE_REASONS.find(r => r.id === id)?.label ?? 'Other'
}

export function bannerTitle(mode: string): string {
  return mode === 'remote' ? 'Learning from home' : 'School is closed'
}

/** Short text for the in-app notification sent to parents, students and teachers. */
export function notificationText(c: { mode: string; reason: string; message: string | null; expected_end_on: string | null }): { title: string; body: string } {
  const head = c.mode === 'remote'
    ? `Learning from home (${reasonLabel(c.reason).toLowerCase()})`
    : `School closed (${reasonLabel(c.reason).toLowerCase()})`
  const parts = [c.message?.trim(), c.expected_end_on ? `Expected to reopen after ${c.expected_end_on}.` : null].filter(Boolean)
  return { title: bannerTitle(c.mode), body: [head, ...parts].join(' ').slice(0, 400) }
}
