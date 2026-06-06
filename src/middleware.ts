// middleware.ts — Route protection for SchoolOS
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// Routes that require authentication
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/admin',
  '/onboarding',
  '/super-admin',
]

// Routes that are public
const PUBLIC_ROUTES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/register-school',
  '/select-school',
  '/offline',
  '/api',
  '/super-admin/login',   // super-admin login page must stay public
]

// Role → allowed dashboard prefix
const ROLE_DASHBOARDS: Record<string, string> = {
  student:   '/dashboard/student',
  teacher:   '/dashboard/teacher',
  principal: '/dashboard/principal',
  bursar:    '/dashboard/bursar',
  secretary: '/dashboard/secretary',
  parent:    '/dashboard/parent',
  admin:     '/admin',
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Always allow public routes + static assets
  if (
    PUBLIC_ROUTES.some(r => pathname.startsWith(r)) ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.startsWith('/icons') ||
    pathname.startsWith('/manifest') ||
    pathname === '/'
  ) {
    return NextResponse.next()
  }

  // Create response to mutate cookies
  let response = NextResponse.next({
    request: { headers: request.headers },
  })

  // Create Supabase server client
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value
        },
        set(name: string, value: string, options: CookieOptions) {
          request.cookies.set({ name, value, ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value, ...options })
        },
        remove(name: string, options: CookieOptions) {
          request.cookies.set({ name, value: '', ...options })
          response = NextResponse.next({ request: { headers: request.headers } })
          response.cookies.set({ name, value: '', ...options })
        },
      },
    }
  )

  // ── Verify auth with getUser() (validates token server-side + auto-refreshes) ──
  // NOTE: Never use getSession() in middleware — it only reads cookies and
  // does NOT refresh an expired access token, causing false logouts.
  const { data: { user } } = await supabase.auth.getUser()

  // Not authenticated → redirect to appropriate login
  if (!user && PROTECTED_PREFIXES.some(p => pathname.startsWith(p))) {
    // Super-admin routes go to the super-admin login, not the regular one
    if (pathname.startsWith('/super-admin')) {
      return NextResponse.redirect(new URL('/super-admin/login', request.url))
    }
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Authenticated on /login → redirect to dashboard
  if (user && pathname === '/login') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, onboarding_stage')
      .eq('id', user.id)
      .single()

    if (profile) {
      // Check onboarding completion
      if (profile.onboarding_stage === 'stage_1_pending' || profile.onboarding_stage === 1) {
        return NextResponse.redirect(new URL('/onboarding/stage-1', request.url))
      }
      if (profile.onboarding_stage === 2 || profile.onboarding_stage === 'start') {
        return NextResponse.redirect(new URL('/onboarding/stage-2', request.url))
      }
      if (profile.onboarding_stage === 3) {
        return NextResponse.redirect(new URL('/onboarding/stage-3', request.url))
      }

      const dest = ROLE_DASHBOARDS[profile.role] ?? '/dashboard/student'
      return NextResponse.redirect(new URL(dest, request.url))
    }
  }

  // Role-based access: prevent accessing another role's dashboard
  if (user && pathname.startsWith('/dashboard')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, onboarding_stage')
      .eq('id', user.id)
      .single()

    if (profile) {
      // Block dashboard access until onboarding is complete
      const stage = profile.onboarding_stage
      if (stage === 'stage_1_pending' || stage === 1) {
        return NextResponse.redirect(new URL('/onboarding/stage-1', request.url))
      }
      if (stage === 2 || stage === 'start') {
        return NextResponse.redirect(new URL('/onboarding/stage-2', request.url))
      }
      if (stage === 3) {
        return NextResponse.redirect(new URL('/onboarding/stage-3', request.url))
      }

      const allowedPrefix = ROLE_DASHBOARDS[profile.role]
      if (allowedPrefix && !pathname.startsWith(allowedPrefix) && !pathname.startsWith('/dashboard/student/profile')) {
        return NextResponse.redirect(new URL(allowedPrefix, request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|icons|manifest|sw.js|workbox).*)',
  ],
}
