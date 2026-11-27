import 'fake-indexeddb/auto' // must load before Dexie so it finds an IndexedDB
import { describe, it, expect, beforeEach } from 'vitest'
import { __resetOfflineDbForTests, getDb } from '../db'
import { enqueueUpsert, getOutboxCounts, listOutbox } from '../outbox'
import { flushOutbox, type SyncClient } from '../syncEngine'
import type { UpsertResult } from '../classify'

const row = (student: string) => ({
  school_id: 's1',
  student_id: student,
  class_id: 'c1',
  date: '2026-11-22',
  status: 'present',
  is_present: true,
})

const enqueue = (student: string, userId = 'u1') =>
  enqueueUpsert({ userId, schoolId: 's1', table: 'attendance', label: 'Attendance', rows: [row(student)] })

const OK: UpsertResult = { error: null, status: 201 }
const OFFLINE: UpsertResult = { error: { message: 'TypeError: Failed to fetch' }, status: 0 }
const RLS: UpsertResult = { error: { code: '42501', message: 'new row violates row-level security policy' }, status: 403 }
const DOWN: UpsertResult = { error: { message: 'bad gateway' }, status: 503 }
const EXPIRED: UpsertResult = { error: { code: 'PGRST301', message: 'JWT expired' }, status: 401 }

function makeClient(handler: (call: number, rows: Record<string, unknown>[]) => UpsertResult | Promise<UpsertResult>) {
  const calls: Array<{ table: string; rows: Record<string, unknown>[]; onConflict: string }> = []
  const client: SyncClient = {
    from: (table) => ({
      upsert: async (rows, opts) => {
        calls.push({ table, rows, onConflict: opts.onConflict })
        return handler(calls.length, rows)
      },
    }),
  }
  return { client, calls }
}

beforeEach(async () => {
  await __resetOfflineDbForTests()
})

describe('flushOutbox', () => {
  it('sends items in the order they were queued and empties the queue', async () => {
    await enqueue('a')
    await enqueue('b')
    await enqueue('c')
    const { client, calls } = makeClient(() => OK)
    const result = await flushOutbox(client, 'u1')
    expect(result).toEqual({ sent: 3, failed: 0, remaining: 0, stopped: 'done' })
    expect(calls.map((c) => c.rows[0].student_id)).toEqual(['a', 'b', 'c'])
    expect(calls[0].table).toBe('attendance')
    expect(calls[0].onConflict).toBe('student_id,date,class_id')
  })

  it('stops on a network failure, keeps everything and does not burn attempts', async () => {
    await enqueue('a')
    await enqueue('b')
    const { client, calls } = makeClient(() => OFFLINE)
    const result = await flushOutbox(client, 'u1')
    expect(result).toMatchObject({ sent: 0, failed: 0, remaining: 2, stopped: 'network' })
    expect(calls).toHaveLength(1) // did not hammer the second item
    const items = await listOutbox('u1')
    expect(items.every((i) => i.attempts === 0 && i.status === 'pending')).toBe(true)
  })

  it('treats a thrown fetch error as a network failure', async () => {
    await enqueue('a')
    const client: SyncClient = {
      from: () => ({
        upsert: () => {
          throw new TypeError('Failed to fetch')
        },
      }),
    }
    const result = await flushOutbox(client, 'u1')
    expect(result).toMatchObject({ remaining: 1, stopped: 'network' })
  })

  it('moves a refused write to failed and keeps going', async () => {
    await enqueue('a')
    await enqueue('b')
    const { client } = makeClient((call) => (call === 1 ? RLS : OK))
    const result = await flushOutbox(client, 'u1')
    expect(result).toEqual({ sent: 1, failed: 1, remaining: 0, stopped: 'done' })
    expect(await getOutboxCounts('u1')).toEqual({ pending: 0, failed: 1 })
    const [failedItem] = await listOutbox('u1', 'failed')
    expect(failedItem.lastError).toContain('row-level security')
  })

  it('backs off after a server error and succeeds later', async () => {
    await enqueue('a')
    let healthy = false
    const { client, calls } = makeClient(() => (healthy ? OK : DOWN))

    const first = await flushOutbox(client, 'u1', { now: () => 1000, random: () => 0 })
    expect(first).toMatchObject({ remaining: 1, stopped: 'backoff' })
    const [item] = await listOutbox('u1')
    expect(item.attempts).toBe(1)
    expect(item.nextAttemptAt).toBe(1000 + 2500)

    // Too early: nothing is sent.
    healthy = true
    const tooSoon = await flushOutbox(client, 'u1', { now: () => 1500 })
    expect(tooSoon.stopped).toBe('backoff')
    expect(calls).toHaveLength(1)

    const later = await flushOutbox(client, 'u1', { now: () => 4000 })
    expect(later).toEqual({ sent: 1, failed: 0, remaining: 0, stopped: 'done' })
  })

  it('gives up after maxAttempts server errors', async () => {
    await enqueue('a')
    const { client } = makeClient(() => DOWN)
    await flushOutbox(client, 'u1', { now: () => 0, random: () => 0, maxAttempts: 2 })
    const second = await flushOutbox(client, 'u1', { now: () => 10_000_000, random: () => 0, maxAttempts: 2 })
    expect(second).toMatchObject({ failed: 1, remaining: 0 })
    expect(await getOutboxCounts('u1')).toEqual({ pending: 0, failed: 1 })
  })

  it('stops on an expired session without burning attempts', async () => {
    await enqueue('a')
    const { client } = makeClient(() => EXPIRED)
    const result = await flushOutbox(client, 'u1')
    expect(result).toMatchObject({ remaining: 1, stopped: 'auth' })
    const [item] = await listOutbox('u1')
    expect(item.attempts).toBe(0)
  })

  it('only sends the signed-in user items', async () => {
    await enqueue('mine', 'u1')
    await enqueue('theirs', 'u2')
    const { client, calls } = makeClient(() => OK)
    await flushOutbox(client, 'u1')
    expect(calls.map((c) => c.rows[0].student_id)).toEqual(['mine'])
    expect(await getOutboxCounts('u2')).toEqual({ pending: 1, failed: 0 })
  })

  it('runs once when called twice at the same time', async () => {
    await enqueue('a')
    const { client, calls } = makeClient(() => OK)
    const [a, b] = await Promise.all([flushOutbox(client, 'u1'), flushOutbox(client, 'u1')])
    expect(calls).toHaveLength(1)
    expect(a).toBe(b)
  })

  it('refuses to send a tampered item for a table that is not allowed', async () => {
    await getDb().outbox.add({
      id: 'evil',
      userId: 'u1',
      schoolId: 's1',
      table: 'payments',
      op: 'upsert',
      rows: [{ school_id: 's1' }],
      onConflict: 'id',
      label: 'x',
      status: 'pending',
      attempts: 0,
      nextAttemptAt: 0,
      createdAt: Date.now(),
      lastError: null,
    })
    const { client, calls } = makeClient(() => OK)
    const result = await flushOutbox(client, 'u1')
    expect(calls).toHaveLength(0)
    expect(result).toMatchObject({ sent: 0, failed: 1, remaining: 0 })
  })
})
