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

  // ── Get user (validated server-side, never trusts a stale/forged cookie) ──
  // getUser() contacts Supabase Auth on every call, making it the only
  // correct choice for route protection. getSession() is client-side only
  // and must never be used for access control decisions.
  const { data: { user } } = await supabase.auth.getUser()

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
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, school_id')
      .eq('id', user.id)
      .single()

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
    if (appointmentTypes && profile?.role !== 'principal') {
      const { data: appt } = await supabase
        .from('appointments')
        .select('id')
        .eq('profile_id', user.id)
        .eq('school_id', profile?.school_id ?? '')
        .eq('status', 'active')
        .in('appointment_type', appointmentTypes)
        .limit(1)
        .maybeSingle()

      if (!appt) {
        const home = ROLE_HOME[profile?.role ?? ''] ?? '/login'
        return NextResponse.redirect(new URL(home, request.url))
      }
    }

    if (profile && profile.school_id) {
      const { data: school } = await supabase
        .from('schools')
        .select('setup_status, is_platform_active')
        .eq('id', profile.school_id)
        .single()

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
  }

  // ── Root redirect ────────────────────────────────────────────
  if (pathname === '/') {
    if (user) {
      return NextResponse.redirect(new URL('/dashboard', request.url))
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
