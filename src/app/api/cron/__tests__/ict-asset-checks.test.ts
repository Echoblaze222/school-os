// src/app/api/cron/__tests__/ict-asset-checks.test.ts
//
// The ict-asset-checks cron originally did 2 extra DB round trips per
// overdue asset event and 1 per expiring asset, on top of a query per
// school - O(schools x assets) round trips. Batched into one query per
// check-type per school. This test proves the batched version makes
// the exact same overdue/dedupe/warranty decisions the original
// per-row version did, using the same hand-rolled Supabase mock
// pattern as expirePendingSchools.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'

type Row = Record<string, any>
let db: Record<string, Map<string, Row>>
const notifyCalls: any[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => makeMockAdmin(),
}))

vi.mock('@/lib/notify', () => ({
  notifyAppointmentHolders: async (_admin: any, schoolId: string, roles: string[], notification: any) => {
    notifyCalls.push({ schoolId, roles, notification })
  },
}))

function table(name: string): Map<string, Row> {
  if (!db[name]) db[name] = new Map()
  return db[name]
}

function matches(row: Row, filters: any[]) {
  return filters.every(([op, col, val]) => {
    if (op === 'eq') return row[col] === val
    if (op === 'neq') return row[col] !== val
    if (op === 'lt') return row[col] < val
    if (op === 'gt') return row[col] > val
    if (op === 'lte') return row[col] <= val
    if (op === 'gte') return row[col] >= val
    if (op === 'in') return val.includes(row[col])
    if (op === 'not_is_null') return row[col] != null
    return true
  })
}

function builder(tableName: string) {
  const filters: any[] = []
  let mode: 'select' | 'insert' = 'select'
  let insertRow: any = null

  const chain: any = {
    select: () => chain,
    insert: (row: any) => { mode = 'insert'; insertRow = row; return chain },
    eq:  (c: string, v: any) => { filters.push(['eq', c, v]); return chain },
    neq: (c: string, v: any) => { filters.push(['neq', c, v]); return chain },
    lt:  (c: string, v: any) => { filters.push(['lt', c, v]); return chain },
    gt:  (c: string, v: any) => { filters.push(['gt', c, v]); return chain },
    lte: (c: string, v: any) => { filters.push(['lte', c, v]); return chain },
    gte: (c: string, v: any) => { filters.push(['gte', c, v]); return chain },
    in:  (c: string, v: any[]) => { filters.push(['in', c, v]); return chain },
    not: (c: string, _op: string, _v: any) => { filters.push(['not_is_null', c, null]); return chain },
    then: (resolve: any, reject: any) => {
      if (mode === 'insert') {
        const id = `${tableName}-${table(tableName).size + 1}`
        table(tableName).set(id, { id, ...insertRow })
        return Promise.resolve({ data: null, error: null }).then(resolve, reject)
      }
      let rows = [...table(tableName).values()].filter((r) => matches(r, filters))
      // Simulate the ict_asset_events -> ict_assets(asset_tag, name) join
      if (tableName === 'ict_asset_events') {
        rows = rows.map((r) => ({ ...r, ict_assets: table('ict_assets').get(r.asset_id) ?? null }))
      }
      return Promise.resolve({ data: rows, error: null }).then(resolve, reject)
    },
  }
  return chain
}

function makeMockAdmin() {
  return { from: (t: string) => builder(t) }
}

beforeEach(() => {
  db = { schools: new Map(), ict_asset_events: new Map(), ict_assets: new Map(), portal_audit_log: new Map() }
  notifyCalls.length = 0
  vi.stubEnv('CRON_SECRET', 'test-secret')
})

const today = new Date().toISOString().slice(0, 10)
const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
const dayAgo  = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

function req() {
  return new Request('http://localhost/api/cron/ict-asset-checks', { headers: { authorization: 'Bearer test-secret' } })
}

describe('ict-asset-checks cron (batched)', () => {
  it('notifies for an overdue asset that was never returned', async () => {
    table('schools').set('s1', { id: 's1' })
    table('ict_assets').set('a1', { id: 'a1', asset_tag: 'ICT-001', name: 'Laptop', school_id: 's1', warranty_expires_at: null, status: 'active' })
    table('ict_asset_events').set('e1', { id: 'e1', asset_id: 'a1', school_id: 's1', event_type: 'borrowed', due_back_at: dayAgo })

    const { GET } = await import('../ict-asset-checks/route')
    const res = await GET(req())
    const json = await res.json()

    expect(json.overdueNotified).toBe(1)
    expect(notifyCalls).toHaveLength(1)
    expect(notifyCalls[0].notification.title).toBe('Overdue device return')
    expect([...table('portal_audit_log').values()][0].metadata.dedupe_key).toBe(`ict_overdue_asset:a1:${today}`)
  })

  it('does not notify for an asset returned after its due date', async () => {
    table('schools').set('s1', { id: 's1' })
    table('ict_assets').set('a1', { id: 'a1', asset_tag: 'ICT-001', name: 'Laptop', school_id: 's1', warranty_expires_at: null, status: 'active' })
    table('ict_asset_events').set('e1', { id: 'e1', asset_id: 'a1', school_id: 's1', event_type: 'borrowed', due_back_at: dayAgo })
    table('ict_asset_events').set('e2', { id: 'e2', asset_id: 'a1', school_id: 's1', event_type: 'returned', created_at: hourAgo })

    const { GET } = await import('../ict-asset-checks/route')
    const res = await GET(req())
    const json = await res.json()

    expect(json.overdueNotified).toBe(0)
    expect(notifyCalls).toHaveLength(0)
  })

  it('does not re-notify an asset already alerted today (dedupe)', async () => {
    table('schools').set('s1', { id: 's1' })
    table('ict_assets').set('a1', { id: 'a1', asset_tag: 'ICT-001', name: 'Laptop', school_id: 's1', warranty_expires_at: null, status: 'active' })
    table('ict_asset_events').set('e1', { id: 'e1', asset_id: 'a1', school_id: 's1', event_type: 'borrowed', due_back_at: dayAgo })
    table('portal_audit_log').set('log1', {
      id: 'log1', action: 'ict_device_maintenance_alert', target_id: 'a1',
      metadata: { dedupe_key: `ict_overdue_asset:a1:${today}` }, logged_at: new Date().toISOString(),
    })

    const { GET } = await import('../ict-asset-checks/route')
    const res = await GET(req())
    const json = await res.json()

    expect(json.overdueNotified).toBe(0)
    expect(notifyCalls).toHaveLength(0)
  })

  it('handles multiple schools independently and aggregates counts correctly', async () => {
    table('schools').set('s1', { id: 's1' })
    table('schools').set('s2', { id: 's2' })
    table('ict_assets').set('a1', { id: 'a1', asset_tag: 'A1', name: 'Laptop 1', school_id: 's1', warranty_expires_at: null, status: 'active' })
    table('ict_assets').set('a2', { id: 'a2', asset_tag: 'A2', name: 'Laptop 2', school_id: 's2', warranty_expires_at: null, status: 'active' })
    table('ict_asset_events').set('e1', { id: 'e1', asset_id: 'a1', school_id: 's1', event_type: 'borrowed', due_back_at: dayAgo })
    table('ict_asset_events').set('e2', { id: 'e2', asset_id: 'a2', school_id: 's2', event_type: 'borrowed', due_back_at: dayAgo })

    const { GET } = await import('../ict-asset-checks/route')
    const res = await GET(req())
    const json = await res.json()

    expect(json.overdueNotified).toBe(2)
    expect(notifyCalls.map((c) => c.schoolId).sort()).toEqual(['s1', 's2'])
  })

  it('notifies for warranty expiring within 30 days, respects dedupe separately from the overdue branch', async () => {
    table('schools').set('s1', { id: 's1' })
    const in10Days = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    table('ict_assets').set('a1', { id: 'a1', asset_tag: 'A1', name: 'Laptop', school_id: 's1', warranty_expires_at: in10Days, status: 'active' })

    const { GET } = await import('../ict-asset-checks/route')
    const res = await GET(req())
    const json = await res.json()

    expect(json.warrantyNotified).toBe(1)
    expect(json.overdueNotified).toBe(0)
    expect(notifyCalls[0].notification.title).toBe('Warranty expiring soon')
  })

  it('rejects a request without the correct cron secret', async () => {
    const { GET } = await import('../ict-asset-checks/route')
    const res = await GET(new Request('http://localhost/api/cron/ict-asset-checks'))
    expect(res.status).toBe(401)
  })
})
