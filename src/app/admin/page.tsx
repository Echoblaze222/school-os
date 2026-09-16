// src/app/admin/page.tsx
// Was the original platform admin panel, gated by a single hardcoded
// PLATFORM_ADMIN_EMAIL env var rather than the platform_admins table +
// PIN system - superseded by everything under /super-admin/*, which is
// where Speed actually works now. Kept as a redirect rather than a 404
// so old bookmarks/links still land somewhere useful, and so the stray
// profiles.role = 'super_admin' row that used to route here (see
// dashboard/page.tsx and page.tsx's ROLE_ROUTES) doesn't dead-end.
import { redirect } from 'next/navigation'

export default function AdminPage() {
  redirect('/super-admin')
}
