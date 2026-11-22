// src/lib/offline/classify.ts
// Pure helpers (no I/O, no dependencies) for the offline sync engine:
// deciding what a failed write MEANS, and how long to wait before retrying.
// Kept separate so the rules are trivially unit-testable.

export interface UpsertResult {
  error: { code?: string; message: string } | null
  /** HTTP status from PostgREST. 0 means the request never reached a server. */
  status?: number
}

/**
 * ok       - written; remove from the outbox
 * network  - never reached the server (offline / DNS / aborted). NOT the item's
 *            fault: stop the flush, do not count an attempt, keep the item.
 * auth     - session missing/expired and could not be refreshed. Stop the flush,
 *            do not count an attempt; items wait until the same user signs in.
 * server   - 5xx / 408 / 429. Count an attempt, back off, eventually give up.
 * fatal    - the server understood and refused (RLS 403, constraint, bad data).
 *            Retrying can never help: move to the failed list for a human.
 */
export type Outcome = 'ok' | 'network' | 'auth' | 'server' | 'fatal'

export const MAX_ATTEMPTS = 8
export const BASE_DELAY_MS = 5_000
export const MAX_DELAY_MS = 10 * 60_000

// Messages produced by fetch() itself when the request never completes
// (Chrome: "Failed to fetch", Safari: "Load failed", Firefox: "NetworkError...").
// Deliberately NOT matching bare "timeout" or "aborted": Postgres statement
// timeouts and "current transaction is aborted" are server problems.
const NETWORK_MESSAGE =
  /failed to fetch|networkerror|network error|network request failed|load failed|fetch failed|the operation was aborted|aborterror|econnreset|econnrefused|enotfound/i
const AUTH_CODE = /^PGRST30[1-3]$/
const JWT_MESSAGE = /jwt (expired|invalid)|invalid jwt/i

export function classifyResult(res: UpsertResult): Outcome {
  const err = res.error
  if (!err) return 'ok'
  const status = res.status
  const message = err.message ?? ''
  const code = err.code ?? ''

  if (status === 0 || NETWORK_MESSAGE.test(message)) return 'network'
  if (status === 401 || AUTH_CODE.test(code) || JWT_MESSAGE.test(message)) return 'auth'
  if (status !== undefined && (status === 408 || status === 429 || status >= 500)) return 'server'
  return 'fatal'
}

/**
 * Exponential backoff with "equal jitter": half fixed, half random. The jitter
 * matters at scale - after an outage thousands of devices would otherwise all
 * retry on the same second and hit the database together.
 */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const exp = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1))
  return Math.round(exp / 2 + random() * (exp / 2))
}
