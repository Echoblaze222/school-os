// src/lib/rateLimit.ts
// Shared helper for throttling unauthenticated, code-guessable endpoints
// (currently: /api/auth/first-login, /api/auth/code-signin).
//
// Backed by the `check_rate_limit` Postgres function (see
// hotfix-01-rate-limit-schema.sql) so the check-and-increment is atomic
// and correct across every serverless instance — an in-memory counter
// would reset on every cold start and wouldn't be shared across
// concurrent Vercel invocations.
//
// Deliberately fails CLOSED, unlike ai_check_rate_limit's fail-open
// choice: that route only throttles paid usage, so an outage should not
// block a paying user. These two routes gate account takeover, so an
// outage in the limiter should not become a way to bypass it.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RateLimitResult {
  allowed: boolean
  /** Set when allowed is false, or when the check itself failed. */
  errorResponse?: { error: string; status: number; retryAfter?: number }
}

/**
 * Checks and records one attempt against a scope+identifier pair.
 * Call once per dimension you want to protect — e.g. once keyed by the
 * caller's IP (catches distributed guessing across many codes) and once
 * keyed by the code itself (catches hammering one specific code).
 */
export async function checkRateLimit(
  adminClient: SupabaseClient,
  scope: string,
  identifier: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const { data: allowed, error } = await adminClient.rpc('check_rate_limit', {
    p_scope: scope,
    p_identifier: identifier,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })

  if (error) {
    console.error(`[rateLimit] check failed for scope=${scope}:`, error.message)
    // Fail closed: an unavailable limiter must not become a way around
    // the throttling it's supposed to provide on an account-takeover-
    // capable endpoint.
    return {
      allowed: false,
      errorResponse: {
        error: 'Something went wrong. Please try again in a moment.',
        status: 503,
      },
    }
  }

  if (allowed === false) {
    return {
      allowed: false,
      errorResponse: {
        error: 'Too many attempts. Please wait a few minutes and try again.',
        status: 429,
        retryAfter: windowSeconds,
      },
    }
  }

  return { allowed: true }
}

/** Best-effort caller IP extraction behind Vercel's proxy. */
export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
