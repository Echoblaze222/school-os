// src/components/public/PublicFooter.tsx
// Simple, honest footer: only links to pages that actually exist. No
// placeholder "Blog" / "Careers" / social icons pointing nowhere.

import Link from 'next/link'
import AnimatedLogo from '@/components/AnimatedLogo'
import styles from './PublicFooter.module.css'

export default function PublicFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandCol}>
          <div className={styles.brandRow}>
            <AnimatedLogo size={28} variant="dark-bg" />
            <span className={styles.brandName}>School<span className={styles.brandAccent}>OS</span></span>
          </div>
          <p className={styles.tagline}>
            The complete school management platform, built for Nigerian schools.
          </p>
        </div>

        <div className={styles.linkCol}>
          <p className={styles.colTitle}>Platform</p>
          <Link href="/find-schools" className={styles.footerLink}>Find Schools</Link>
          <Link href="/register-school" className={styles.footerLink}>Register your school</Link>
          <Link href="/select-school" className={styles.footerLink}>Login</Link>
        </div>

        <div className={styles.linkCol}>
          <p className={styles.colTitle}>Legal</p>
          <Link href="/privacy" className={styles.footerLink}>Privacy Policy</Link>
          <Link href="/terms" className={styles.footerLink}>Terms of Service</Link>
        </div>
      </div>

      <div className={styles.bottomBar}>
        <p>© {new Date().getFullYear()} SchoolOS. All rights reserved.</p>
      </div>
    </footer>
  )
}
