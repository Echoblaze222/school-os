// src/lib/__tests__/launchRedirects.test.ts
//
// Covers the app-launch path through src/middleware.ts: what happens when a
// signed-in user opens '/' or '/dashboard' (which is exactly what the Android
// shell does on every cold start), and that the checks that must NOT be
// skipped - onboarding, role boundary, school lock - still win.
//
// Supabase isn't reachable from the sandbox/CI, so @supabase/ssr is mocked
// with just enough of the chainable query builder for the middleware's real
// control flow to run. `fromCalls` records every table queried so the tests
// can assert how many database round-trips a request costs.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { dashboardDestination } from '@/lib/dashboardDispatch'

type Row = Record<string, unknown> | null

let user: { id: string } | null
let profileRow: Row
let apptRow: Row
let fromCalls: string[]
let refreshCookie: boolean

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (c: { name: string; value: string; options?: object }[]) => void } },
  ) => ({
    auth: {
      getUser: async () => {
        // Simulate Supabase refreshing the session: it writes a new cookie
        // through the cookies adapter while resolving the user.
        if (refreshCookie) opts.cookies.setAll([{ name: 'sb-test-auth-token', value: 'refreshed', options: { path: '/' } }])
        return { data: { user } }
      },
      signOut: async () => ({}),
    },
    from: (table: string) => {
      fromCalls.push(table)
      const builder: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'limit']) builder[m] = () => builder
      builder.single = async () => ({ data: table === 'profiles' ? profileRow : null })
      builder.maybeSingle = async () => ({ data: table === 'appointments' ? apptRow : null })
      return builder
    },
  }),
}))

// Imported after the mock is registered.
const { middleware } = await import('@/middleware')

const BASE = 'https://app.test'
const req = (path: string) => new NextRequest(`${BASE}${path}`)
const location = (res: Response) => {
  const loc = res.headers.get('location')
  return loc ? loc.replace(BASE, '') : null
}
const okSchool = { setup_status: 'active', is_platform_active: true }
const student = (extra: Record<string, unknown> = {}) => ({
  role: 'student', school_id: 's1', onboarding_stage: 'complete', school: okSchool, ...extra,
})

beforeEach(() => {
  user = { id: 'u1' }
  profileRow = student()
  apptRow = null
  fromCalls = []
  refreshCookie = false
})

describe('dashboardDestination (pure)', () => {
  it('sends each role to its own dashboard', () => {
    expect(dashboardDestination({ role: 'student', school_id: 's' })).toBe('/dashboard/student')
    expect(dashboardDestination({ role: 'teacher', school_id: 's' })).toBe('/dashboard/teacher')
    expect(dashboardDestination({ role: 'principal', school_id: 's' })).toBe('/dashboard/principal')
    expect(dashboardDestination({ role: 'bursar', school_id: 's' })).toBe('/dashboard/bursar')
    expect(dashboardDestination({ role: 'secretary', school_id: 's' })).toBe('/dashboard/secretary')
    expect(dashboardDestination({ role: 'parent', school_id: 's' })).toBe('/dashboard/parent')
    expect(dashboardDestination({ role: 'super_admin', school_id: 's' })).toBe('/super-admin')
  })
  it('sends a profile with no school to the applications area (same as the page)', () => {
    expect(dashboardDestination({ role: 'parent', school_id: null })).toBe('/dashboard/applications')
  })
  it('returns null when it cannot decide, so the page can handle it', () => {
    expect(dashboardDestination(null)).toBeNull()
    expect(dashboardDestination({ role: 'wizard', school_id: 's' })).toBeNull()
    expect(dashboardDestination({ role: null, school_id: 's' })).toBeNull()
  })
})

describe("launch at '/'", () => {
  it('signed-in student goes straight to their dashboard in ONE redirect, ONE query', async () => {
    const res = await middleware(req('/'))
    expect(location(res)).toBe('/dashboard/student')
    expect(fromCalls).toEqual(['profiles'])
  })
  it('falls back to /dashboard when the profile cannot be read (old behaviour)', async () => {
    profileRow = null
    const res = await middleware(req('/'))
    expect(location(res)).toBe('/dashboard')
  })
  it('signed-out visitor still sees the public landing page', async () => {
    user = null
    const res = await middleware(req('/'))
    expect(location(res)).toBeNull()
    expect(fromCalls).toEqual([])
  })
})

describe("launch at '/dashboard'", () => {
  it('dispatches to the role dashboard with ONE database query (no separate schools query)', async () => {
    const res = await middleware(req('/dashboard'))
    expect(location(res)).toBe('/dashboard/student')
    expect(fromCalls).toEqual(['profiles'])
  })
  it('self-signup profile with no school goes to applications', async () => {
    profileRow = student({ role: 'parent', school_id: null, school: null })
    const res = await middleware(req('/dashboard'))
    expect(location(res)).toBe('/dashboard/applications')
  })
  it('falls through to the page when the destination cannot be decided', async () => {
    profileRow = student({ role: 'wizard' })
    const res = await middleware(req('/dashboard'))
    expect(location(res)).toBeNull()
  })
  it('falls through to the page when the profile is missing', async () => {
    profileRow = null
    const res = await middleware(req('/dashboard'))
    expect(location(res)).toBeNull()
  })
  it('signed-out visitor is sent to login', async () => {
    user = null
    const res = await middleware(req('/dashboard'))
    expect(location(res)).toBe('/login?next=%2Fdashboard')
  })
})

describe('checks that must still win over dispatch', () => {
  it('incomplete onboarding goes to onboarding, not the dashboard', async () => {
    profileRow = student({ onboarding_stage: 'stage_1_pending' })
    expect(location(await middleware(req('/dashboard')))).toBe('/onboarding/stage-1')
    profileRow = student({ onboarding_stage: 'stage_2_pending' })
    expect(location(await middleware(req('/dashboard')))).toBe('/onboarding/stage-2')
  })
  it('hard-locked school blocks a non-principal', async () => {
    profileRow = student({ school: { setup_status: 'locked', is_platform_active: false } })
    expect(location(await middleware(req('/dashboard')))).toBe('/school-locked?status=locked&role=student')
  })
  it('hard-locked school blocks even the principal', async () => {
    profileRow = student({ role: 'principal', school: { setup_status: 'locked', is_platform_active: false } })
    expect(location(await middleware(req('/dashboard')))).toBe('/school-locked?status=locked&role=principal')
  })
  it('billing-locked school blocks a non-principal', async () => {
    profileRow = student({ school: { setup_status: 'expired', is_platform_active: true } })
    expect(location(await middleware(req('/dashboard')))).toBe('/school-locked?status=expired&role=student')
  })
  it('billing-locked principal is confined to the renewal page, not their dashboard', async () => {
    profileRow = student({ role: 'principal', school: { setup_status: 'expired', is_platform_active: true } })
    expect(location(await middleware(req('/dashboard')))).toBe('/dashboard/principal/subscriptions?status=expired')
    expect(location(await middleware(req('/dashboard/principal/staff')))).toBe('/dashboard/principal/subscriptions?status=expired')
    expect(location(await middleware(req('/dashboard/principal/subscriptions')))).toBeNull()
  })
  it('role boundary still redirects someone on another role\'s dashboard', async () => {
    expect(location(await middleware(req('/dashboard/teacher')))).toBe('/dashboard/student')
  })
  it('appointment-gated dashboard still requires an active appointment', async () => {
    profileRow = student({ role: 'teacher' })
    apptRow = null
    expect(location(await middleware(req('/dashboard/nurse')))).toBe('/dashboard/teacher')
    apptRow = { id: 'a1' }
    expect(location(await middleware(req('/dashboard/nurse')))).toBeNull()
  })
  it("the user's own dashboard just renders (no dispatch, one query)", async () => {
    const res = await middleware(req('/dashboard/student'))
    expect(location(res)).toBeNull()
    expect(fromCalls).toEqual(['profiles'])
  })
})

describe('session cookies survive the launch redirects', () => {
  it("a refreshed session cookie is carried onto the '/' redirect", async () => {
    refreshCookie = true
    const res = await middleware(req('/'))
    expect(res.headers.getSetCookie().join(';')).toContain('sb-test-auth-token=refreshed')
  })
  it("a refreshed session cookie is carried onto the '/dashboard' redirect", async () => {
    refreshCookie = true
    const res = await middleware(req('/dashboard'))
    expect(res.headers.getSetCookie().join(';')).toContain('sb-test-auth-token=refreshed')
  })
})
