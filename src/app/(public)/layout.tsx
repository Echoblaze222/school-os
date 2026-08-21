// src/app/(public)/layout.tsx
// Public platform (Phase 4, Lane C) route group. Deliberately minimal -
// full landing-page branding/navigation is Lane A's scope. This exists
// so /find-school and /apply have a consistent, professional shell
// instead of rendering bare, while staying easy for Lane A to absorb
// into a fuller public shell later without restructuring these routes.

import Link from 'next/link'
import styles from './public.module.css'

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/find-school" className={styles.brand}>SchoolOS</Link>
        <Link href="/dashboard/applications" className={styles.myAppsLink}>My Applications</Link>
      </header>
      <main className={styles.main}>{children}</main>
    </div>
  )
}
