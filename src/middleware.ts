// src/middleware.ts
// ─────────────────────────────────────────────────────────────
// 1. Protects all dashboard/private routes, redirects to /login if no session
// 2. Redirects authenticated users away from auth pages
// 3. Sets session timeout: user is logged out after INACTIVITY_MINUTES of no activity
// 4. Enforces school lock:
//    - Hard lock (super-admin suspended) → everyone, incl. principal, to /school-locked
//    - Billing lock (expired/suspended)  → non-principals to /school-locked;
//      principal confined to /dashboard/principal/subscriptions to renew
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { dashboardDestination } from '@/lib/dashboardDispatch'

// ── Config ──────────────────────────────────────────────────
const INACTIVITY_MINUTES = 30          // Auto-logout after 30 min idle
const INACTIVITY_MS = INACTIVITY_MINUTES * 60 * 1000

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  '/',                                   // root - now the public landing page (Phase 4, Lane A); see the '/' handling below in the main function, which no longer redirects it to /splash for signed-out visitors
                                          // must NOT be caught by the generic route-protection
                                          // check or it gets sent to /login before ever reaching
                                          // the landing page
  '/splash',
  '/select-school',
  '/login',
  '/register-school',
  '/forgot-password',
  '/reset-password',
  '/terms',
  '/privacy',
  '/offline',
  '/api/auth',                          // code-signin, first-login, must be public
  '/api/schools/register',
  '/api/schools/payment-callback',
  '/api/schools/paystack-webhook',
  '/api/webhooks/paystack',            // Paystack payment webhook
  '/api/internal/push-on-notification', // pg_net → push trigger, no session cookie; gated by its own x-internal-secret check below, not this middleware
  '/api/internal/email-retry',          // pg_net → email-retry cron (every 5 min), no session cookie; gated by its own x-internal-secret check in the route. Without this entry the cron POST was redirected to /login and never reached the route (405 every time).
  '/api/push/send',                     // pg_net → fire_pending_reminders, same reasoning
  '/api/cron', 
  '/super-admin/login',                 // super admin login must be publicly reachable
  '/school-locked',                     // lock page itself must be reachable

  // ── Public platform (Phase 4, Lane C) ──────────────────────
  // Self-service signup - the one path that creates a SchoolOS
  // identity WITHOUT an admin-issued access code. Distinct from
  // /login (existing code-based staff/student/parent onboarding),
  // which is untouched.
  '/join',
  '/api/auth/self-register',
  // Public school discovery and the admission-request flow itself.
  // Actually submitting an application still requires a session -
  // that check happens in the page/API layer, not here - this only
  // allows an unauthenticated visitor to browse and start the flow.
  '/find-school',
  '/apply',
  '/api/admission/schools',
  '/api/schools/search',                // "Find Your School" live search - public, unauthenticated (route already scopes columns + rate-limits internally)

  // ── Public platform (Phase 4, Lane E/F) ────────────────────
  '/api/public',                        // Lane E/F/G/H public discovery, promotions, rankings, reports, content - read/track endpoints only
  '/discover',                          // public promotions feed (Lane E)
  '/rankings',                          // public rankings (Lane F)

  // ── Public platform (Phase 4, Lane H) ───────────────────────
  '/blog',                              // public SchoolOS editorial content

  // ── Public platform (Phase 4, Lane A/B) ─────────────────────
  '/find-schools',                      // Lane A - general public discovery (distinct from Lane C's /find-school, the admission-flow entry point)
  '/schools',                           // Lane B - public school profile pages (/schools/[slug])
]

// Routes that authenticated users should be bounced away from
const AUTH_ONLY_PATHS = [
  '/splash',
  '/select-school',
  '/login',
  '/register-school',
  '/forgot-password',
  '/super-admin/login',                 // logged-in super admins go straight to dashboard
  '/join',                              // logged-in users don't need self-signup, go to dashboard
]

// ── Role-based dashboard access ────────────────────────────────
// Each dashboard route is scoped to exactly one role. Without this,
// any authenticated user who knows/guesses another role's URL (e.g.
// a secretary typing /dashboard/principal/staff) can open that role's
// pages. This must stay in sync with ROLE_ROUTES in
// src/app/dashboard/page.tsx.
const DASHBOARD_ROLE_SEGMENTS = ['principal', 'teacher', 'secretary', 'bursar', 'parent', 'student']
const ROLE_HOME: Record<string, string> = {
  student:     '/dashboard/student',
  teacher:     '/dashboard/teacher',
  principal:   '/dashboard/principal',
  bursar:      '/dashboard/bursar',
  secretary:   '/dashboard/secretary',
  parent:      '/dashboard/parent',
  super_admin: '/admin',
}

// ── Appointment-gated dashboards (Phase 2) ─────────────────────
// New top-level dashboards that aren't keyed to a base profiles.role at
// all, access depends on holding an ACTIVE row in `appointments`, not on
// a role string. Kept separate from DASHBOARD_ROLE_SEGMENTS above since
// the check is structurally different (appointments table, not
// profiles.role).
//
// 'counselor', 'ict', and 'hostel' added here retroactively: all three
// dashboards originally shipped with only a page-level appointment check
// (see the comment at the top of dashboard/counselor/page.tsx and
// dashboard/hostel/page.tsx), documented at the time as "middleware
// doesn't understand appointment-based roles yet." This dict is exactly
// the mechanism that was missing, so all three are registered now that
// it exists; the page-level checks stay in place too; middleware is the
// outer floor, the route's own check is the inner one, neither alone is
// enough.
const APPOINTMENT_DASHBOARD_SEGMENTS: Record<string, string[]> = {
  examination: [
    'examination_officer', 'examination_coordinator', 'examination_secretary',
    'exam_setter', 'invigilator', 'result_officer', 'result_verification_officer',
  ],
  counselor: ['counselor'],
  ict: ['ict_officer', 'ict_administrator'],
  'vice-principal': ['vice_principal'],
  hostel: ['warden', 'assistant_warden', 'house_parent', 'hostel_administrator'],
  nurse: ['nurse'],
  librarian: ['librarian'],
  coach: ['coach'],
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip Next.js internals and static files
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/icons/') ||
    pathname.startsWith('/fonts/') ||
    pathname === '/favicon.ico' ||
    pathname === '/manifest.json' ||
    pathname === '/sw.js'
  ) {
    return NextResponse.next()
  }

  // Build Supabase SSR client that reads/writes cookies
  const response = NextResponse.next()

  // A redirect built with NextResponse.redirect() starts with no cookies, so
  // any session-refresh cookies the Supabase client just wrote onto
  // `response` would be dropped and the next request would have to refresh
  // the token all over again. Used only by the launch-path redirects below.
  const redirectKeepingCookies = (url: URL) => {
    const redirect = NextResponse.redirect(url)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // ── Get user ────────────────────────────────────────────────────────
  // getClaims() verifies the session's JWT instead of asking the Supabase
  // Auth server about it on every request:
  //   - project uses asymmetric JWT signing keys: the signature is checked
  //     locally against the project's public keys (JWKS, cached in memory),
  //     so there is NO network call to Supabase Auth. The token is still
  //     cryptographically verified and expiry is still enforced; a forged
  //     or tampered cookie is rejected.
  //   - project still uses the legacy shared (HS256) secret: supabase-js
  //     itself falls back to getUser(), i.e. exactly the previous behaviour.
  // It still refreshes an expired access token via the refresh token and
  // writes the new cookies through setAll above.
  //
  // Trade-off: with local verification, a session revoked server-side (user
  // banned/deleted, global sign-out from another device) is only noticed
  // when the current access token expires (Supabase default: 1 hour), not on
  // the very next request. Everything that must take effect immediately in
  // this file - school lock, onboarding, role and appointment checks - is
  // read from the database below on every request and is unaffected.
  const { data: claimsData } = await supabase.auth.getClaims()
  const subject = claimsData?.claims?.sub
  const user = subject ? { id: subject } : null

  const isPublicPath   = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
  const isAuthOnlyPath = AUTH_ONLY_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  // ── Inactivity check ────────────────────────────────────────
  if (user) {
    const lastActivity = request.cookies.get('schoolos_last_activity')?.value
    const now = Date.now()

    if (lastActivity) {
      const elapsed = now - parseInt(lastActivity, 10)
      if (elapsed > INACTIVITY_MS) {
        // Session has been idle too long, sign out and redirect to login
        await supabase.auth.signOut()

        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('reason', 'timeout')

        const redirectResponse = NextResponse.redirect(loginUrl)
        // Clear the activity cookie
        redirectResponse.cookies.delete('schoolos_last_activity')
        return redirectResponse
      }
    }

    // Update last activity timestamp on every request
    response.cookies.set('schoolos_last_activity', String(now), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: INACTIVITY_MS / 1000,  // expire if not refreshed
    })
  }

  // ── Route protection ────────────────────────────────────────
  if (!user && !isPublicPath) {
    // Not logged in and trying to access a private page
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isAuthOnlyPath) {
    // Already logged in but hitting auth pages, send to the right dashboard
    const dest = pathname.startsWith('/super-admin') ? '/super-admin' : '/dashboard'
    return NextResponse.redirect(new URL(dest, request.url))
  }

  // ── School lock enforcement ──────────────────────────────────
  // Only runs for authenticated users hitting /dashboard routes.
  //
  // Two lock tiers:
  //  - HARD lock ('locked' status or is_platform_active=false): a super
  //    admin manually suspended the school. Blocks EVERYONE, including
  //    the principal, straight to /school-locked.
  //  - BILLING lock ('expired' trial or 'suspended' subscription): all
  //    non-principal roles go to /school-locked as before. The principal
  //    is allowed to stay logged in, but is confined to
  //    /dashboard/principal/subscriptions so they can renew, any other
  //    /dashboard/principal/* route redirects them there instead.
  //
  // Previously principals were exempted from this check entirely, so an
  // expired/suspended school kept working in full through the principal
  // account with no way to force renewal.
  if (user && pathname.startsWith('/dashboard')) {
    // The school's lock fields are fetched in the SAME query as the profile
    // (PostgREST embedded select over profiles_school_id_fkey) instead of a
    // second, dependent `schools` query. That removes one full Supabase
    // round-trip from every /dashboard navigation. RLS still applies to both
    // tables exactly as before - same user, same policies. The explicit FK
    // name avoids ambiguity if profiles ever gains another FK to schools.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, school_id, onboarding_stage, school:schools!profiles_school_id_fkey(setup_status, is_platform_active)')
      .eq('id', user.id)
      .single()

    // ── Enforce onboarding completion ───────────────────────────
    // A user with a valid session but an incomplete onboarding stage
    // (e.g. activated their account, then closed the browser before
    // finishing stage-1) must not be able to reach a dashboard by
    // navigating straight to a URL - stage-1 is also where Terms &
    // Privacy acceptance is collected and recorded, so skipping it
    // means skipping that acceptance too. This is enforced here,
    // server-side, rather than relying only on the login page's
    // post-sign-in redirect, which a direct URL visit bypasses entirely.
    if (profile?.onboarding_stage === 'stage_1_pending') {
      return NextResponse.redirect(new URL('/onboarding/stage-1', request.url))
    }
    if (profile?.onboarding_stage === 'stage_2_pending') {
      return NextResponse.redirect(new URL('/onboarding/stage-2', request.url))
    }

    // ── Enforce role boundary ────────────────────────────────
    // '/dashboard/principal/...' -> 'principal'. If the segment is a
    // known role dashboard and doesn't match this user's own role,
    // redirect them to wherever they actually belong instead of
    // letting the page render (or fail half-rendered from RLS).
    const roleSegment = pathname.split('/')[2]
    if (roleSegment && DASHBOARD_ROLE_SEGMENTS.includes(roleSegment)) {
      const userRole = profile?.role
      if (userRole !== roleSegment) {
        const home = ROLE_HOME[userRole ?? ''] ?? '/login'
        return NextResponse.redirect(new URL(home, request.url))
      }
    }

    // ── Enforce appointment boundary (Phase 2) ─────────────────
    // Principal always passes (school-wide default scope, same as every
    // other lane's assumption), everyone else needs a live, active row
    // in `appointments` for one of the types this segment permits.
    // Repeated here even though the segment's own layout.tsx/page.tsx
    // also re-checks server-side, because "a hidden nav item is never a
    // security boundary" cuts both ways: middleware is the outer floor,
    // the route's own check is the inner one, neither alone is enough.
    const appointmentTypes = APPOINTMENT_DASHBOARD_SEGMENTS[roleSegment]
    const needsAppointmentCheck = !!appointmentTypes && profile?.role !== 'principal'
    const needsSchoolCheck = !!(profile && profile.school_id)

    // Only the appointment-boundary check still needs its own query (and
    // only for appointment-gated dashboards); the school-lock fields already
    // arrived with the profile above. Redirect priority is unchanged:
    // appointment boundary still wins over school lock.
    const apptResult = needsAppointmentCheck
      ? await supabase
          .from('appointments')
          .select('id')
          .eq('profile_id', user.id)
          .eq('school_id', profile?.school_id ?? '')
          .eq('status', 'active')
          .in('appointment_type', appointmentTypes!)
          .limit(1)
          .maybeSingle()
      : { data: null as { id: string } | null }

    if (needsAppointmentCheck && !apptResult.data) {
      const home = ROLE_HOME[profile?.role ?? ''] ?? '/login'
      return NextResponse.redirect(new URL(home, request.url))
    }

    if (needsSchoolCheck) {
      // An embedded to-one relation can be typed as an object or a
      // single-item array depending on client typings; normalize both.
      const embedded = (profile as { school?: unknown } | null)?.school
      const school = (Array.isArray(embedded) ? embedded[0] : embedded) as
        | { setup_status: string; is_platform_active: boolean }
        | null
        | undefined
      if (school) {
        const isHardLocked =
          !school.is_platform_active ||
          school.setup_status === 'locked'

        const isBillingLocked =
          school.setup_status === 'expired' ||
          school.setup_status === 'suspended'

        const isPrincipal = profile.role === 'principal'
        const renewalPath = '/dashboard/principal/subscriptions'

        if (isHardLocked) {
          const lockedUrl = new URL('/school-locked', request.url)
          lockedUrl.searchParams.set('status', school.setup_status)
          lockedUrl.searchParams.set('role',   profile.role)
          return NextResponse.redirect(lockedUrl)
        }

        if (isBillingLocked) {
          if (!isPrincipal) {
            const lockedUrl = new URL('/school-locked', request.url)
            lockedUrl.searchParams.set('status', school.setup_status)
            lockedUrl.searchParams.set('role',   profile.role)
            return NextResponse.redirect(lockedUrl)
          }

          // Principal: allow only the renewal page itself; every other
          // principal route bounces there.
          if (pathname !== renewalPath && !pathname.startsWith(renewalPath + '/')) {
            const renewUrl = new URL(renewalPath, request.url)
            renewUrl.searchParams.set('status', school.setup_status)
            return NextResponse.redirect(renewUrl)
          }
        }
      }
    }

    // ── Role dispatch for the bare /dashboard URL ──────────────
    // Every check above has passed, and the profile is already in hand, so
    // send the user straight to their own dashboard from here instead of
    // rendering src/app/dashboard/page.tsx just to redirect (that page
    // repeats the auth check and the profile query). If the destination can't
    // be decided (profile missing, unknown role) fall through and let the
    // page handle it exactly as before.
    if (pathname === '/dashboard') {
      const destination = dashboardDestination(profile)
      if (destination) {
        return redirectKeepingCookies(new URL(destination, request.url))
      }
    }
  }

  // ── Root redirect ────────────────────────────────────────────
  if (pathname === '/') {
    if (user) {
      // Signed-in visitors never see the landing page. Previously this hopped
      // to /dashboard, which then hopped again to the role dashboard - two
      // full redirects on every app launch. Decide the destination here in
      // one hop. The destination request still passes through this
      // middleware, so onboarding, role and school-lock checks all still run
      // on it. If the profile can't be read, keep the old behaviour.
      const { data: launchProfile } = await supabase
        .from('profiles')
        .select('role, school_id')
        .eq('id', user.id)
        .single()
      const destination = dashboardDestination(launchProfile)
      return redirectKeepingCookies(new URL(destination ?? '/dashboard', request.url))
    }
    // Phase 4, Lane A (S38): '/' is now the public marketing landing
    // page (src/app/page.tsx renders it directly for a signed-out
    // visitor) - it must NOT be redirected away. The cinematic /splash
    // entrance still exists; it now plays when a visitor actually
    // chooses to log in (from the landing page's own CTA), rather than
    // gating everyone before they have seen anything about the product.
    return NextResponse.next()
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
