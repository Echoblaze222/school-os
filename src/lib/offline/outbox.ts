// src/lib/offline/outbox.ts
// CLIENT ONLY. The write queue. Screens call enqueueUpsert() instead of (or as a
// fallback to) writing straight to Supabase when the backend is unreachable.
//
// SAFETY RULES
//  1. Allowlist. Only tables listed in OFFLINE_WRITABLE_TABLES can be queued, and
//     each with ONE fixed conflict key. Payments, billing, invoices, role or
//     account changes are deliberately absent: those go through server routes
//     with idempotency keys (see src/lib/idempotency.ts) and must fail loudly
//     offline, never be replayed later.
//  2. Only idempotent writes. An upsert on a natural key can be replayed any
//     number of times and ends in the same state, so a retry after a flaky
//     network can never create duplicates.
//  3. Tenant guard. Every row must carry the school_id being written; the
//     server's RLS is still the real authority, this just stops a bug here from
//     queueing a cross-school write.

import { getDb, type OutboxItem } from './db'

export const OFFLINE_WRITABLE_TABLES: Record<string, { onConflict: string }> = {
  // Phase 2 pilot. Natural key matches the unique constraint the teacher
  // attendance screen already upserts on.
  attendance: { onConflict: 'student_id,date,class_id' },
}

export function isOfflineWritable(table: string, onConflict: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(OFFLINE_WRITABLE_TABLES, table)) return false
  return OFFLINE_WRITABLE_TABLES[table].onConflict === onConflict
}

export class OutboxValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutboxValidationError'
  }
}

export interface EnqueueUpsertInput {
  userId: string
  schoolId: string
  table: string
  rows: Record<string, unknown>[]
  label: string
}

/**
 * Queue an upsert. Resolves with the item id once it is durably stored; if this
 * throws, the caller must NOT tell the user the change was saved.
 * Items for the same rows queued twice replay in order, so the last one wins.
 */
export async function enqueueUpsert(input: EnqueueUpsertInput): Promise<string> {
  const { userId, schoolId, table, rows, label } = input
  if (!userId) throw new OutboxValidationError('userId is required')
  if (!schoolId) throw new OutboxValidationError('schoolId is required')
  if (!Object.prototype.hasOwnProperty.call(OFFLINE_WRITABLE_TABLES, table)) {
    throw new OutboxValidationError(`Table "${table}" cannot be saved offline`)
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new OutboxValidationError('rows must be a non-empty array')
  }
  if (rows.some((r) => r.school_id !== schoolId)) {
    throw new OutboxValidationError('Every row must belong to the school being written')
  }

  const id = globalThis.crypto.randomUUID()
  const item: OutboxItem = {
    id,
    userId,
    schoolId,
    table,
    op: 'upsert',
    rows,
    onConflict: OFFLINE_WRITABLE_TABLES[table].onConflict,
    label,
    status: 'pending',
    attempts: 0,
    nextAttemptAt: 0,
    createdAt: Date.now(),
    lastError: null,
  }
  await getDb().outbox.add(item)
  return id
}

export async function getOutboxCounts(userId: string): Promise<{ pending: number; failed: number }> {
  const db = getDb()
  const [pending, failed] = await Promise.all([
    db.outbox.where('[userId+status]').equals([userId, 'pending']).count(),
    db.outbox.where('[userId+status]').equals([userId, 'failed']).count(),
  ])
  return { pending, failed }
}

export async function listOutbox(userId: string, status?: 'pending' | 'failed'): Promise<OutboxItem[]> {
  const db = getDb()
  const items = status
    ? await db.outbox.where('[userId+status]').equals([userId, status]).toArray()
    : await db.outbox.where('userId').equals(userId).toArray()
  return items.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
}

/** Put a failed item back in the queue (e.g. after the user fixed the cause). */
export async function retryFailedItem(id: string): Promise<void> {
  await getDb()
    .outbox.where('id')
    .equals(id)
    .modify({ status: 'pending', attempts: 0, nextAttemptAt: 0, lastError: null })
}

export async function discardItem(id: string): Promise<void> {
  await getDb().outbox.where('id').equals(id).delete()
}
