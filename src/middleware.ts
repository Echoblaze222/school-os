// src/middleware.ts
// ─────────────────────────────────────────────────────────────
// 1. Protects all dashboard/private routes — redirects to /login if no session
// 2. Redirects authenticated users away from auth pages
// 3. Sets session timeout: user is logged out after INACTIVITY_MINUTES of no activity
// ─────────────────────────────────────────────────────────────

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

// ── Config ──────────────────────────────────────────────────
const INACTIVITY_MINUTES = 30          // Auto-logout after 30 min idle
const INACTIVITY_MS = INACTIVITY_MINUTES * 60 * 1000

// Routes that do NOT require authentication
const PUBLIC_PATHS = [
  '/splash',
  '/select-school',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/offline',
  '/api/auth',                          // code-signin, first-login — must be public
  '/api/schools/register',
  '/api/schools/payment-callback',
  '/api/schools/paystack-webhook',
]

// Routes that authenticated users should be bounced away from
const AUTH_ONLY_PATHS = [
  '/splash',
  '/select-school',
  '/login',
  '/register',
  '/forgot-password',
]

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

  // ── Get session ─────────────────────────────────────────
  const { data: { session } } = await supabase.auth.getSession()

  const isPublicPath = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
  const isAuthOnlyPath = AUTH_ONLY_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  // ── Inactivity check ────────────────────────────────────
  if (session) {
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

  // ── Route protection ────────────────────────────────────
  if (!session && !isPublicPath) {
    // Not logged in and trying to access a private page
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (session && isAuthOnlyPath) {
    // Already logged in but hitting auth pages — send to dashboard
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Root redirect ────────────────────────────────────────
  if (pathname === '/') {
    if (session) {
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
