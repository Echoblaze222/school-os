import 'fake-indexeddb/auto' // must load before Dexie so it finds an IndexedDB
import { describe, it, expect, beforeEach } from 'vitest'
import { __resetOfflineDbForTests, getDb } from '../db'
import { enqueueUpsert, getOutboxCounts, listOutbox, retryFailedItem, discardItem, OutboxValidationError } from '../outbox'

const row = (student: string, status = 'present') => ({
  school_id: 's1',
  student_id: student,
  class_id: 'c1',
  date: '2026-11-22',
  status,
  is_present: status === 'present',
})

const base = { userId: 'u1', schoolId: 's1', table: 'attendance', label: 'Attendance' }

beforeEach(async () => {
  await __resetOfflineDbForTests()
})

describe('enqueueUpsert', () => {
  it('stores a pending item using the allowlisted conflict key', async () => {
    const id = await enqueueUpsert({ ...base, rows: [row('a')] })
    const [item] = await listOutbox('u1')
    expect(item.id).toBe(id)
    expect(item.status).toBe('pending')
    expect(item.onConflict).toBe('student_id,date,class_id')
    expect(item.attempts).toBe(0)
  })

  it('rejects tables that are not on the allowlist', async () => {
    await expect(enqueueUpsert({ ...base, table: 'payments', rows: [row('a')] })).rejects.toBeInstanceOf(OutboxValidationError)
    await expect(enqueueUpsert({ ...base, table: 'constructor', rows: [row('a')] })).rejects.toBeInstanceOf(OutboxValidationError)
  })

  it('rejects rows from another school', async () => {
    await expect(
      enqueueUpsert({ ...base, rows: [{ ...row('a'), school_id: 'other' }] }),
    ).rejects.toBeInstanceOf(OutboxValidationError)
  })

  it('rejects empty rows and missing ids', async () => {
    await expect(enqueueUpsert({ ...base, rows: [] })).rejects.toBeInstanceOf(OutboxValidationError)
    await expect(enqueueUpsert({ ...base, userId: '', rows: [row('a')] })).rejects.toBeInstanceOf(OutboxValidationError)
  })
})

describe('counts and management', () => {
  it('counts per user and status', async () => {
    await enqueueUpsert({ ...base, rows: [row('a')] })
    await enqueueUpsert({ ...base, userId: 'u2', rows: [row('b')] })
    expect(await getOutboxCounts('u1')).toEqual({ pending: 1, failed: 0 })
    expect(await getOutboxCounts('u2')).toEqual({ pending: 1, failed: 0 })
  })

  it('retryFailedItem puts a failed item back in the queue', async () => {
    const id = await enqueueUpsert({ ...base, rows: [row('a')] })
    await getDb().outbox.where('id').equals(id).modify({ status: 'failed', attempts: 3, lastError: 'boom' })
    expect(await getOutboxCounts('u1')).toEqual({ pending: 0, failed: 1 })
    await retryFailedItem(id)
    const [item] = await listOutbox('u1')
    expect(item).toMatchObject({ status: 'pending', attempts: 0, lastError: null, nextAttemptAt: 0 })
  })

  it('discardItem removes it', async () => {
    const id = await enqueueUpsert({ ...base, rows: [row('a')] })
    await discardItem(id)
    expect(await listOutbox('u1')).toHaveLength(0)
  })
})
