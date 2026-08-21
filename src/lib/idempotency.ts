// src/lib/idempotency.ts
// Shared helper for making financial/critical operations safe against
// duplicate submission — double-tapped "Confirm payment", a retried
// webhook delivery, a flaky-network retry of "Generate invoices".
//
// Backed by the `reserve_idempotency_key` / `complete_idempotency_key`
// Postgres functions (see docs/lane1-production-foundation/
// 01-idempotency-schema.sql) so the check-and-reserve is atomic across
// every serverless instance, same reasoning as rateLimit.ts.
//
// Deliberately fails CLOSED: if the idempotency check itself can't be
// performed, we do not proceed with an unprotected financial mutation.
// That's the opposite tradeoff from ai_check_rate_limit's fail-open
// choice, on purpose — a blocked AI reply costs nothing, a duplicate
// invoice or double-refund costs real money.

import type { SupabaseClient } from '@supabase/supabase-js'

export type IdempotencyOutcome =
  | { kind: 'proceed' }
  | { kind: 'duplicate_in_progress' }
  | { kind: 'replay'; response: unknown }
  | { kind: 'check_failed' }

/**
 * Reserves an idempotency key before performing a side effect.
 * Call this first; only proceed with the mutation if `kind === 'proceed'`.
 */
export async function reserveIdempotencyKey(
  adminClient: SupabaseClient,
  scope: string,
  key: string
): Promise<IdempotencyOutcome> {
  const { data, error } = await adminClient
    .rpc('reserve_idempotency_key', { p_scope: scope, p_key: key })
    .single<{ outcome: string; cached_response: unknown }>()

  if (error || !data) {
    console.error(`[idempotency] reserve failed for scope=${scope}:`, error?.message)
    return { kind: 'check_failed' }
  }

  if (data.outcome === 'completed') return { kind: 'replay', response: data.cached_response }
  if (data.outcome === 'in_progress') return { kind: 'duplicate_in_progress' }
  return { kind: 'proceed' }
}

/** Call after the mutation succeeds, to cache the response for replay on duplicate calls. */
export async function completeIdempotencyKey(
  adminClient: SupabaseClient,
  scope: string,
  key: string,
  response: unknown
): Promise<void> {
  const { error } = await adminClient.rpc('complete_idempotency_key', {
    p_scope: scope,
    p_key: key,
    p_status: 'completed',
    p_response: response as never,
  })
  if (error) console.error(`[idempotency] complete failed for scope=${scope}:`, error.message)
}

/** Call if the mutation throws, so a genuine failure can be retried instead of stuck "in_progress" forever. */
export async function failIdempotencyKey(
  adminClient: SupabaseClient,
  scope: string,
  key: string
): Promise<void> {
  const { error } = await adminClient.rpc('complete_idempotency_key', {
    p_scope: scope,
    p_key: key,
    p_status: 'failed',
    p_response: null,
  })
  if (error) console.error(`[idempotency] fail-mark failed for scope=${scope}:`, error.message)
}

/**
 * Convenience wrapper: reserves the key, runs `fn`, marks complete/failed,
 * and returns a result the route can turn straight into a NextResponse.
 * Use for the common case; call the three functions above directly if a
 * route needs finer control (e.g. returning a specific status per outcome).
 */
export async function withIdempotency<T>(
  adminClient: SupabaseClient,
  scope: string,
  key: string,
  fn: () => Promise<T>
): Promise<
  | { status: 'ok'; result: T }
  | { status: 'replayed'; result: unknown }
  | { status: 'conflict' }
  | { status: 'unavailable' }
> {
  const outcome = await reserveIdempotencyKey(adminClient, scope, key)

  if (outcome.kind === 'check_failed') return { status: 'unavailable' }
  if (outcome.kind === 'duplicate_in_progress') return { status: 'conflict' }
  if (outcome.kind === 'replay') return { status: 'replayed', result: outcome.response }

  try {
    const result = await fn()
    await completeIdempotencyKey(adminClient, scope, key, result as never)
    return { status: 'ok', result }
  } catch (err) {
    await failIdempotencyKey(adminClient, scope, key)
    throw err
  }
}
