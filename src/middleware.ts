// src/middleware.ts
// ─────────────────────────────────────────────────────────────
// 1. Protects all dashboard/private routes — redirects to /login if no session
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
  '/',                                   // root — handled by its own redirect logic below;
                                          // must NOT be caught by the generic route-protection
                                          // check or it gets sent to /login before ever reaching
                                          // the splash redirect
  '/splash',
  '/select-school',
  '/login',
  '/register-school',
  '/forgot-password',
  '/reset-password',
  '/terms',
  '/privacy',
  '/offline',
  '/api/auth',                          // code-signin, first-login — must be public
  '/api/schools/register',
  '/api/schools/payment-callback',
  '/api/schools/paystack-webhook',
  '/api/webhooks/paystack',            // Paystack payment webhook
  '/api/cron', 
  '/super-admin/login',                 // super admin login must be publicly reachable
  '/school-locked',                     // lock page itself must be reachable
]

// Routes that authenticated users should be bounced away from
const AUTH_ONLY_PATHS = [
  '/splash',
  '/select-school',
  '/login',
  '/register-school',
  '/forgot-password',
  '/super-admin/login',                 // logged-in super admins go straight to dashboard
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

  // ── Get user (validated server-side — never trusts a stale/forged cookie) ──
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
        // Session has been idle too long — sign out and redirect to login
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
    // Already logged in but hitting auth pages — send to the right dashboard
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
  //    /dashboard/principal/subscriptions so they can renew — any other
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
    // First-time visitors go through the splash → select-school flow.
    // Auto-logout redirects already land on /login directly (see above),
    // so this only runs when someone opens the root URL fresh.
    return NextResponse.redirect(new URL('/splash', request.url))
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
