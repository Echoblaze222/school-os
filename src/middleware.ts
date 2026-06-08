// src/middleware.ts
// 1. Protects all dashboard/private routes — redirects to /login if no session
// 2. Redirects authenticated users away from auth pages
// 3. Sets session timeout: user is logged out after INACTIVITY_MINUTES of idle

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

const INACTIVITY_MINUTES = 30
const INACTIVITY_MS = INACTIVITY_MINUTES * 60 * 1000

const PUBLIC_PATHS = [
  '/splash',
  '/select-school',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/offline',
  '/register-school',
  '/api/schools/register',
  '/api/schools/payment-callback',
  '/api/schools/paystack-webhook',
  '/api/auth/first-login',
]

const AUTH_ONLY_PATHS = [
  '/splash',
  '/select-school',
  '/login',
  '/register',
  '/forgot-password',
]

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

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

  // Create a mutable response we can attach cookies to
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

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
            response = NextResponse.next({
              request: { headers: request.headers },
            })
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // IMPORTANT: Always call getUser() not getSession() for security
  // getUser() validates the token with Supabase auth server
  const { data: { user } } = await supabase.auth.getUser()

  const isPublicPath   = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
  const isAuthOnlyPath = AUTH_ONLY_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))

  // ── Inactivity timeout check ────────────────────────
  if (user) {
    const lastActivity = request.cookies.get('schoolos_last_activity')?.value
    const now = Date.now()

    if (lastActivity) {
      const elapsed = now - parseInt(lastActivity, 10)
      if (elapsed > INACTIVITY_MS) {
        // Force sign-out by clearing all Supabase auth cookies
        const redirectResponse = NextResponse.redirect(
          new URL('/login?reason=timeout', request.url)
        )

        // Delete the activity cookie
        redirectResponse.cookies.delete('schoolos_last_activity')

        // Clear all supabase auth cookies so browser session is truly gone
        request.cookies.getAll().forEach(cookie => {
          if (cookie.name.startsWith('sb-') || cookie.name.includes('supabase')) {
            redirectResponse.cookies.delete(cookie.name)
          }
        })

        return redirectResponse
      }
    }

    // Refresh activity timestamp on every request
    response.cookies.set('schoolos_last_activity', String(now), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: INACTIVITY_MS / 1000,
    })
  }

  // ── Route protection ────────────────────────────────
  if (!user && !isPublicPath) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (user && isAuthOnlyPath) {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  // ── Root redirect ────────────────────────────────────
  if (pathname === '/') {
    return NextResponse.redirect(
      new URL(user ? '/dashboard' : '/splash', request.url)
    )
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
