// src/lib/__tests__/launchRedirects.test.ts
//
// Covers the app-launch path through src/middleware.ts: what happens when a
// signed-in user opens '/' or '/dashboard' (which is exactly what the Android
// shell does on every cold start), and that the checks that must NOT be
// skipped - onboarding, role boundary, school lock - still win. Also covers the
// outage handling: when Supabase cannot be reached the person is sent to
// /service-unavailable, not treated as signed out or as having the wrong role.
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
let authCalls: string[]
let refreshCookie: boolean
// Outage simulation: the auth service is unreachable, and/or the profile
// query comes back with an error + status (0 = network failure, 5xx = backend).
let authOutage: boolean
let profileResult: { error: { message: string } | null; status: number }

vi.mock('@supabase/ssr', () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: { cookies: { setAll: (c: { name: string; value: string; options?: object }[]) => void } },
  ) => ({
    auth: {
      // The middleware must verify the session with getClaims() (local JWT
      // verification) - never getUser(), which is a network call each time.
      getClaims: async () => {
        authCalls.push('getClaims')
        if (authOutage) {
          return { data: null, error: { name: 'AuthRetryableFetchError', status: 0, message: 'fetch failed' } }
        }
        // Simulate Supabase refreshing the session: it writes a new cookie
        // through the cookies adapter while resolving the claims.
        if (refreshCookie) opts.cookies.setAll([{ name: 'sb-test-auth-token', value: 'refreshed', options: { path: '/' } }])
        return user
          ? { data: { claims: { sub: user.id } }, error: null }
          : { data: null, error: { message: 'no session' } }
      },
      getUser: async () => {
        authCalls.push('getUser')
        return { data: { user } }
      },
      signOut: async () => ({}),
    },
    from: (table: string) => {
      fromCalls.push(table)
      const builder: Record<string, unknown> = {}
      // abortSignal: the middleware gives the profile query a timeout.
      for (const m of ['select', 'eq', 'in', 'limit', 'abortSignal']) builder[m] = () => builder
      builder.single = async () => ({
        data: table === 'profiles' ? profileRow : null,
        ...(table === 'profiles' ? profileResult : {}),
      })
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
  authCalls = []
  refreshCookie = false
  authOutage = false
  profileResult = { error: null, status: 200 }
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

describe('authentication uses local claim verification', () => {
  it('verifies the session with getClaims() and never calls getUser() (no Auth-server round-trip)', async () => {
    await middleware(req('/'))
    await middleware(req('/dashboard'))
    await middleware(req('/dashboard/student'))
    expect(authCalls).toEqual(['getClaims', 'getClaims', 'getClaims'])
  })
  it('a request with no valid session is treated as signed out', async () => {
    user = null
    expect(location(await middleware(req('/dashboard/student')))).toBe('/login?next=%2Fdashboard%2Fstudent')
    expect(fromCalls).toEqual([])
  })
  it('the user id comes from the verified claims (profile lookup uses the token subject)', async () => {
    user = { id: 'abc-123' }
    await middleware(req('/dashboard/student'))
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

describe('a Supabase outage is not mistaken for being signed out or having the wrong role', () => {
  it('auth service unreachable on a private page goes to /service-unavailable, not /login', async () => {
    authOutage = true
    expect(location(await middleware(req('/dashboard/student')))).toBe('/service-unavailable?next=%2Fdashboard%2Fstudent')
    expect(fromCalls).toEqual([])
  })
  it('auth outage keeps the query string so the person returns to the same page', async () => {
    authOutage = true
    expect(location(await middleware(req('/dashboard/student?tab=fees')))).toBe(
      '/service-unavailable?next=%2Fdashboard%2Fstudent%3Ftab%3Dfees',
    )
  })
  it('auth outage does not block public pages', async () => {
    authOutage = true
    expect(location(await middleware(req('/find-schools')))).toBeNull()
    expect(location(await middleware(req('/')))).toBeNull()
    expect(location(await middleware(req('/login')))).toBeNull()
  })
  it('the holding page and the health probe stay reachable during an outage (no redirect loop)', async () => {
    authOutage = true
    expect(location(await middleware(req('/service-unavailable')))).toBeNull()
    expect(location(await middleware(req('/api/health')))).toBeNull()
  })
  it('database unreachable (status 0) on a dashboard goes to /service-unavailable, not /login', async () => {
    profileRow = null
    profileResult = { error: { message: 'TypeError: fetch failed' }, status: 0 }
    expect(location(await middleware(req('/dashboard/student')))).toBe('/service-unavailable?next=%2Fdashboard%2Fstudent')
  })
  it('database 5xx on a dashboard goes to /service-unavailable', async () => {
    profileRow = null
    profileResult = { error: { message: 'Bad gateway' }, status: 502 }
    expect(location(await middleware(req('/dashboard')))).toBe('/service-unavailable?next=%2Fdashboard')
  })
  it('a normal "no row" answer (406) is not an outage and is handled as before', async () => {
    profileRow = null
    profileResult = { error: { message: 'JSON object requested, multiple (or no) rows returned' }, status: 406 }
    expect(location(await middleware(req('/dashboard')))).toBeNull()
  })
  it('a healthy backend is unaffected', async () => {
    expect(location(await middleware(req('/dashboard')))).toBe('/dashboard/student')
  })
})
