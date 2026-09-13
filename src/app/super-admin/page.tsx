// src/app/super-admin/page.tsx
// Was previously a second, overlapping implementation of the schools list
// (SuperAdminDashboard.tsx, now deleted) alongside /super-admin/schools
// (SchoolsPageClient.tsx) - the two had drifted apart over time. Now just
// redirects to the one canonical page.
import { redirect } from 'next/navigation'

export default function SuperAdminPage() {
  redirect('/super-admin/schools')
}
