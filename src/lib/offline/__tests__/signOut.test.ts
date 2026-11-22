import 'fake-indexeddb/auto' // must load before Dexie so it finds an IndexedDB
import { describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { __resetOfflineDbForTests } from '../db'
import { enqueueUpsert, getOutboxCounts } from '../outbox'
import { flushBeforeSignOut } from '../signOut'
import type { UpsertResult } from '../classify'

const OK: UpsertResult = { error: null, status: 201 }
const OFFLINE: UpsertResult = { error: { message: 'TypeError: Failed to fetch' }, status: 0 }

function fakeSupabase(userId: string | null, result: UpsertResult = OK) {
  const upserts: unknown[] = []
  const supabase = {
    auth: { getSession: async () => ({ data: { session: userId ? { user: { id: userId } } : null } }) },
    from: () => ({
      upsert: async (rows: unknown) => {
        upserts.push(rows)
        return result
      },
    }),
  }
  return { supabase: supabase as unknown as SupabaseClient, upserts }
}

const queue = (userId = 'u1') =>
  enqueueUpsert({
    userId,
    schoolId: 's1',
    table: 'attendance',
    label: 'Attendance',
    rows: [{ school_id: 's1', student_id: 'a', class_id: 'c1', date: '2026-11-22', status: 'present' }],
  })

beforeEach(async () => {
  await __resetOfflineDbForTests()
})

describe('flushBeforeSignOut', () => {
  it('does nothing when nothing is pending', async () => {
    const { supabase, upserts } = fakeSupabase('u1')
    await flushBeforeSignOut(supabase)
    expect(upserts).toHaveLength(0)
  })

  it('uploads pending changes while the session is still valid', async () => {
    await queue()
    const { supabase, upserts } = fakeSupabase('u1')
    await flushBeforeSignOut(supabase)
    expect(upserts).toHaveLength(1)
    expect(await getOutboxCounts('u1')).toEqual({ pending: 0, failed: 0 })
  })

  it('keeps the changes when still offline', async () => {
    await queue()
    const { supabase } = fakeSupabase('u1', OFFLINE)
    await flushBeforeSignOut(supabase)
    expect(await getOutboxCounts('u1')).toEqual({ pending: 1, failed: 0 })
  })

  it('never touches another user items and never throws', async () => {
    await queue('u2')
    const none = fakeSupabase(null)
    await expect(flushBeforeSignOut(none.supabase)).resolves.toBeUndefined()
    expect(none.upserts).toHaveLength(0)

    const broken = { auth: { getSession: async () => { throw new Error('boom') } } } as unknown as SupabaseClient
    await expect(flushBeforeSignOut(broken)).resolves.toBeUndefined()
    expect(await getOutboxCounts('u2')).toEqual({ pending: 1, failed: 0 })
  })
})
