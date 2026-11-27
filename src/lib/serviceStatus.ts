// src/lib/serviceStatus.ts
// CLIENT ONLY. Tracks whether SchoolOS can currently reach its backend and tells
// the UI, so people see ONE clear message instead of retrying a failing
// request again and again.
//
// How it works
//  - A thin observer on window.fetch notices network failures and gateway
//    errors (502/503/504, Cloudflare 52x) for same-origin requests and for
//    Supabase. It never changes what a request does; it only reports.
//  - A failure does not raise the alarm by itself. It triggers ONE call to
//    /api/health to confirm. If the probe is healthy, nothing is shown.
//  - If the probe says the backend is down or degraded (or the browser is
//    offline) the state flips and the status check repeats on its own with a
//    growing delay (5s, 10s, 20s, 30s, then every 60s), paused while the tab
//    is hidden. When it answers again the state flips back to ok.
//  - "Check now" is available but rate limited by the UI.

export type ServiceState = 'ok' | 'offline' | 'degraded' | 'down'

export interface ServiceSnapshot {
  state: ServiceState
  checking: boolean
  /** Epoch ms of the next automatic check, or null when none is scheduled. */
  nextCheckAt: number | null
  /** True for a few seconds after the service comes back. */
  recovered: boolean
}

const OK_SNAPSHOT: ServiceSnapshot = { state: 'ok', checking: false, nextCheckAt: null, recovered: false }

const BACKOFF_MS = [5_000, 10_000, 20_000, 30_000, 60_000]
const VERIFY_TIMEOUT_MS = 6_000
const GAP_AFTER_OK_MS = 30_000      // min gap between failure-triggered checks when the last probe was healthy
const GAP_AFTER_PROBLEM_MS = 3_000
const RECOVERED_VISIBLE_MS = 4_000

let snapshot: ServiceSnapshot = OK_SNAPSHOT
const listeners = new Set<() => void>()
let rawFetch: typeof fetch | null = null
let attempt = 0
let pollTimer: ReturnType<typeof setTimeout> | null = null
let recoveredTimer: ReturnType<typeof setTimeout> | null = null
let inFlight: Promise<void> | null = null
let lastVerifyAt = 0
let lastResult: ServiceState = 'ok'

function update(patch: Partial<ServiceSnapshot>) {
  snapshot = { ...snapshot, ...patch }
  listeners.forEach((l) => l())
}

// useSyncExternalStore API
export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
export function getSnapshot(): ServiceSnapshot {
  return snapshot
}
export function getServerSnapshot(): ServiceSnapshot {
  return OK_SNAPSHOT
}

/** Ask /api/health. Uses the un-patched fetch so the probe can never report on itself. */
async function verify(): Promise<ServiceState> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS)
  try {
    const res = await (rawFetch ?? fetch)('/api/health', { cache: 'no-store', signal: controller.signal })
    if (res.ok) return 'ok'
    if (res.status >= 500) {
      try {
        const body = (await res.json()) as { status?: string }
        return body.status === 'degraded' ? 'degraded' : 'down'
      } catch {
        return 'down'
      }
    }
    // 4xx (route missing, rate limited...): we cannot tell, so do not alarm anyone.
    return 'ok'
  } catch {
    return 'down'
  } finally {
    clearTimeout(timeout)
  }
}

function scheduleNext() {
  if (pollTimer) clearTimeout(pollTimer)
  const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)]
  attempt += 1
  update({ nextCheckAt: Date.now() + delay })
  pollTimer = setTimeout(() => {
    pollTimer = null
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      // Paused while the tab is in the background; resumes on visibilitychange.
      update({ nextCheckAt: null })
      return
    }
    void checkNow()
  }, delay)
}

function applyResult(result: ServiceState) {
  lastResult = result
  if (result === 'ok') {
    attempt = 0
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
    if (snapshot.state !== 'ok') {
      update({ state: 'ok', checking: false, nextCheckAt: null, recovered: true })
      if (recoveredTimer) clearTimeout(recoveredTimer)
      recoveredTimer = setTimeout(() => update({ recovered: false }), RECOVERED_VISIBLE_MS)
    } else {
      update({ checking: false })
    }
    return
  }
  update({ state: result, checking: false })
  scheduleNext()
}

/** Run a health check now (shared by every caller; only one runs at a time). */
export function checkNow(): Promise<void> {
  if (inFlight) return inFlight
  lastVerifyAt = Date.now()
  update({ checking: true })
  inFlight = verify()
    .then(applyResult)
    .finally(() => {
      inFlight = null
    })
  return inFlight
}

/** A watched request failed. Confirm with ONE probe; do nothing if already handling an outage. */
export function reportFailure() {
  if (snapshot.state !== 'ok') return
  const gap = lastResult === 'ok' ? GAP_AFTER_OK_MS : GAP_AFTER_PROBLEM_MS
  if (Date.now() - lastVerifyAt < gap) return
  void checkNow()
}

function hostOf(url: string | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url).host
  } catch {
    return null
  }
}

function urlOf(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input
  if (input instanceof URL) return input.href
  return input.url
}

function isGatewayFailure(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || (status >= 520 && status <= 530)
}

function isAbort(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { name?: string }).name === 'AbortError'
}

/** Install the fetch observer and browser online/offline listeners. Safe to call many times. */
export function installServiceStatusObserver() {
  if (typeof window === 'undefined') return
  const w = window as unknown as { __schoolosStatusObserver?: boolean }
  if (w.__schoolosStatusObserver) return
  w.__schoolosStatusObserver = true

  rawFetch = window.fetch.bind(window)
  const original = rawFetch
  const supabaseHost = hostOf(process.env.NEXT_PUBLIC_SUPABASE_URL)

  function isWatched(url: string): boolean {
    try {
      const u = new URL(url, window.location.href)
      if (u.origin === window.location.origin) return u.pathname !== '/api/health'
      return supabaseHost !== null && u.host === supabaseHost
    } catch {
      return false
    }
  }

  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const watched = isWatched(urlOf(input))
    try {
      const res = await original(input, init)
      if (watched && isGatewayFailure(res.status)) reportFailure()
      return res
    } catch (err) {
      if (watched && !isAbort(err)) reportFailure()
      throw err
    }
  }) as typeof fetch

  window.addEventListener('offline', () => applyResult('offline'))
  window.addEventListener('online', () => {
    void checkNow()
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && snapshot.state !== 'ok') void checkNow()
  })

  if (navigator.onLine === false) applyResult('offline')
}
