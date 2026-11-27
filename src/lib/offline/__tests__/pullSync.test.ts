import 'fake-indexeddb/auto' // must load before Dexie so it finds an IndexedDB
import { beforeEach, describe, expect, it } from 'vitest'
import { __resetOfflineDbForTests, getDb } from '../db'
import { clearReadCache, getSyncSummary, pullAll, pullTable, readLocal, DELTA_TRUST_MS } from '../pullSync'
import { SYNC_TABLES } from '../syncTables'
import { fakeClient, makeServer } from './fakeSupabase'

const U = 'u1'
const cfg = (t: string) => SYNC_TABLES.find((c) => c.table === t)!
const ts = (n: number) => `2026-11-0${n}T10:00:00.000000+00:00`
const classes = (n: number, at = ts(1)) =>
  Array.from({ length: n }, (_, i) => ({ id: `c${String(i).padStart(2, '0')}`, name: `Class ${i}`, updated_at: at }))

beforeEach(async () => {
  await __resetOfflineDbForTests()
})

describe('pullTable', () => {
  it('first pull copies everything, second pull fetches only what changed', async () => {
    const server = makeServer({ classes: classes(3) })
    const client = fakeClient(server)
    expect((await pullTable(client, U, cfg('classes'), { now: 1000 })).upserted).toBe(3)
    expect((await readLocal(U, 'classes')).rows).toHaveLength(3)

    server.tables.classes[1] = { ...server.tables.classes[1], name: 'Renamed', updated_at: ts(2) }
    const second = await pullTable(client, U, cfg('classes'), { now: 2000 })
    expect(second.upserted).toBe(1)
    const names = (await readLocal<{ name: string }>(U, 'classes')).rows.map((r) => r.name)
    expect(names).toContain('Renamed')
    expect(names).toHaveLength(3)
  })

  it('does not skip rows that share one updated_at across a page boundary', async () => {
    const server = makeServer({ classes: classes(5) }) // all identical updated_at
    const r = await pullTable(fakeClient(server), U, cfg('classes'), { pageSize: 2, now: 1000 })
    expect(r.upserted).toBe(5)
    expect((await readLocal(U, 'classes')).rows).toHaveLength(5)
  })

  it('resumes an interrupted first pull instead of starting over', async () => {
    const server = makeServer({ classes: classes(6) })
    const client = fakeClient(server)
    // The second request fails: simulate by failing after the first page.
    let calls = 0
    const flaky = {
      from: (t: string) => {
        const q = client.from(t)
        const origThen = q.then
        q.then = (res: unknown, rej: unknown) => {
          calls++
          if (calls === 2) return Promise.resolve({ data: null, error: { message: 'Failed to fetch' }, status: 0 }).then(res as never, rej as never)
          return origThen(res, rej)
        }
        return q
      },
    }
    const first = await pullTable(flaky as never, U, cfg('classes'), { pageSize: 2, now: 1000 })
    expect(first.stopped).toBe('network')
    const state = await getDb().syncState.get([U, 'classes'])
    expect(state?.partial).toBe(true)
    expect(state?.gen).toBe(1)

    server.log.length = 0
    const second = await pullTable(client, U, cfg('classes'), { pageSize: 2, now: 2000 })
    expect(second.stopped).toBe('done')
    expect(second.upserted).toBe(4) // only the remaining rows, not all 6
    expect((await readLocal(U, 'classes')).rows).toHaveLength(6)
    expect((await getDb().syncState.get([U, 'classes']))?.partial).toBe(false)
  })

  it('keeps old rows until a stale full re-pull completes, then drops rows deleted meanwhile', async () => {
    const server = makeServer({ classes: classes(3) })
    const client = fakeClient(server)
    await pullTable(client, U, cfg('classes'), { now: 1000 })

    server.tables.classes = server.tables.classes.slice(0, 2) // c02 vanished while the phone was away
    const later = 1000 + DELTA_TRUST_MS + 1
    server.fail.classes = { message: 'Failed to fetch', status: 0 }
    expect((await pullTable(client, U, cfg('classes'), { now: later })).stopped).toBe('network')
    expect((await readLocal(U, 'classes')).rows).toHaveLength(3) // nothing lost on failure

    delete server.fail.classes
    await pullTable(client, U, cfg('classes'), { now: later })
    expect((await readLocal(U, 'classes')).rows).toHaveLength(2)
  })

  it('prunes local attendance rows that fall outside the window', async () => {
    const day = (d: string) => ({ id: d, date: d, updated_at: ts(1) })
    const server = makeServer({ attendance: [day('2026-11-01'), day('2026-03-01')] })
    const client = fakeClient(server)
    const now = Date.parse('2026-11-25T00:00:00Z')
    // Pretend the older row was copied earlier, when it was still inside the window.
    await getDb().rows.put({ u: U, t: 'attendance', id: '2026-03-01', g: 1, data: day('2026-03-01') })
    await pullTable(client, U, cfg('attendance'), { now })
    const ids = (await readLocal<{ id: string }>(U, 'attendance')).rows.map((r) => r.id)
    expect(ids).toEqual(['2026-11-01'])
  })
})

describe('profiles', () => {
  const profile = (id: string, extra: Record<string, unknown> = {}) => ({
    id, full_name: id, role: 'student', class_id: 'cA', updated_at: ts(1),
    email: `${id}@x.y`, date_of_birth: '2010-01-01', default_code: 'SECRET', phone: '1', ...extra,
  })

  it('a student copies only themselves, and no sensitive columns', async () => {
    const server = makeServer({ profiles: [profile('u1'), profile('u2'), profile('u3')] })
    await pullTable(fakeClient(server), U, cfg('profiles'), { role: 'student', now: 1000 })
    const rows = (await readLocal<Record<string, unknown>>(U, 'profiles')).rows
    expect(rows.map((r) => r.id)).toEqual(['u1'])
    expect(Object.keys(rows[0])).not.toContain('email')
    expect(Object.keys(rows[0])).not.toContain('default_code')
    expect(Object.keys(rows[0])).not.toContain('date_of_birth')
    expect(server.log[0].select).not.toContain('email')
  })

  it('an unknown role is treated like a student', async () => {
    const server = makeServer({ profiles: [profile('u1'), profile('u2')] })
    await pullTable(fakeClient(server), U, cfg('profiles'), { role: undefined, now: 1000 })
    expect((await readLocal(U, 'profiles')).rows).toHaveLength(1)
  })

  it('a teacher copies the students of their own classes only', async () => {
    const server = makeServer({
      profiles: [profile('s1', { class_id: 'cA' }), profile('s2', { class_id: 'cB' }), profile('s3', { class_id: 'cA' })],
    })
    await getDb().rows.put({ u: U, t: 'class_teachers', id: 'ct1', g: 1, data: { id: 'ct1', teacher_id: U, class_id: 'cA' } })
    await pullTable(fakeClient(server), U, cfg('profiles'), { role: 'teacher', now: 1000 })
    expect((await readLocal<{ id: string }>(U, 'profiles')).rows.map((r) => r.id).sort()).toEqual(['s1', 's3'])
  })

  it('changing scope forces a full re-pull that removes rows no longer in scope', async () => {
    const server = makeServer({ profiles: [profile('u1'), profile('u2')] })
    const client = fakeClient(server)
    await pullTable(client, U, cfg('profiles'), { role: 'principal', now: 1000 })
    expect((await readLocal(U, 'profiles')).rows).toHaveLength(2)
    await pullTable(client, U, cfg('profiles'), { role: 'student', now: 2000 })
    expect((await readLocal<{ id: string }>(U, 'profiles')).rows.map((r) => r.id)).toEqual(['u1'])
  })
})

describe('pullAll', () => {
  it('applies tombstones, but a new phone ignores deletions from before it existed', async () => {
    const server = makeServer({
      classes: classes(2),
      sync_deletions: [{ id: 5, table_name: 'classes', row_id: 'c00' }],
    })
    const client = fakeClient(server)
    const first = await pullAll(client, U, { now: 1000 })
    expect(first.stopped).toBe('done')
    expect(first.deleted).toBe(0) // baseline: old tombstone skipped
    expect((await readLocal(U, 'classes')).rows).toHaveLength(2)

    server.tables.sync_deletions.push({ id: 6, table_name: 'classes', row_id: 'c01' })
    server.tables.classes = server.tables.classes.filter((c) => c.id !== 'c01')
    const second = await pullAll(client, U, { now: 2000 })
    expect(second.deleted).toBe(1)
    expect((await readLocal<{ id: string }>(U, 'classes')).rows.map((r) => r.id)).toEqual(['c00'])
  })

  it('removes another user\'s local rows (shared phone)', async () => {
    await getDb().rows.put({ u: 'someone-else', t: 'classes', id: 'x', g: 1, data: { id: 'x' } })
    await pullAll(fakeClient(makeServer({ classes: [] })), U, { now: 1000 })
    expect(await getDb().rows.where('u').equals('someone-else').count()).toBe(0)
  })

  it('stops after the first table when the migration is missing (schema error)', async () => {
    const server = makeServer({})
    server.fail.classes = { code: '42703', message: 'column classes.updated_at does not exist' }
    const r = await pullAll(fakeClient(server), U, { now: 1000 })
    expect(r.stopped).toBe('schema')
    expect(r.tables).toHaveLength(1)
    expect(server.log.filter((l) => l.table !== 'sync_deletions')).toHaveLength(1)
  })

  it('getSyncSummary reports tables and rows, and clearReadCache empties it', async () => {
    await pullAll(fakeClient(makeServer({ classes: classes(2) })), U, { now: 1000 })
    const s = await getSyncSummary(U)
    expect(s.tablesReady).toBe(SYNC_TABLES.length)
    expect(s.rows).toBe(2)
    await clearReadCache()
    expect((await getSyncSummary(U)).rows).toBe(0)
  })
})
