// src/lib/dashboardDispatch.ts
//
// Single place that answers: "a signed-in user just landed on '/' or the
// bare '/dashboard' - which dashboard should they actually see?"
//
// This is the SAME decision src/app/dashboard/page.tsx already makes (that
// page is the "role dispatcher"). It lives here as a pure function so the
// middleware can make the decision itself from the profile row it has
// already loaded, instead of redirecting to /dashboard and letting that
// page re-run getUser() + a profiles query just to redirect a second time.
//
// Behaviour is intentionally identical to the page's, including its
// quirks - this is a latency fix, not a routing change:
//   - a profile with no school_id (self-service signup / applicant) goes
//     to the applications area, regardless of role
//   - otherwise the role maps to its own dashboard
//   - an unknown/missing role returns null, meaning "I can't decide":
//     callers must fall back to the existing page, which sends the user
//     to /login exactly as it does today

export interface DispatchProfile {
  role?: string | null
  school_id?: string | null
}

export const DASHBOARD_DISPATCH_ROUTES: Record<string, string> = {
  student:     '/dashboard/student',
  teacher:     '/dashboard/teacher',
  principal:   '/dashboard/principal',
  bursar:      '/dashboard/bursar',
  secretary:   '/dashboard/secretary',
  parent:      '/dashboard/parent',
  super_admin: '/super-admin',
}

export function dashboardDestination(profile: DispatchProfile | null | undefined): string | null {
  if (!profile) return null
  if (!profile.school_id) return '/dashboard/applications'
  return DASHBOARD_DISPATCH_ROUTES[profile.role ?? ''] ?? null
}
