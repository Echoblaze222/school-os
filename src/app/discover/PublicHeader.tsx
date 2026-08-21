// src/app/discover/PublicHeader.tsx
// Minimal shared header for the public discovery/rankings pages.
//
// NOTE: Lane A of this phase (landing page shell, full public nav, brand/
// theme applied to real UI) has not been built yet in this codebase - there
// is no (public) route group to plug into. This header is a deliberately
// small scaffold so Lane E/F have somewhere real to render, not a stand-in
// for Lane A. Replace it with the real shell once Lane A lands; don't
// extend this file with more nav items in the meantime.
import Link from 'next/link'
import Image from 'next/image'
import styles from './public.module.css'

export default function PublicHeader({ active }: { active: 'discover' | 'rankings' }) {
  return (
    <header className={styles.header}>
      <Link href="/discover" className={styles.logoLink}>
        <Image src="/branding/schoolos-lockup.png" alt="SchoolOS" width={132} height={32} priority />
      </Link>
      <nav className={styles.headerNav}>
        <Link href="/discover" className={active === 'discover' ? styles.navActive : styles.navLink}>
          Discover
        </Link>
        <Link href="/rankings" className={active === 'rankings' ? styles.navActive : styles.navLink}>
          Rankings
        </Link>
        <Link href="/login" className={styles.navLink}>Sign in</Link>
      </nav>
    </header>
  )
}
