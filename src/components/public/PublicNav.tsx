'use client'
// src/components/public/PublicNav.tsx
// Landing/discovery/profile nav (§56). Distinct chrome from the internal
// RoleNav by design (marketing surface vs. authenticated app shell), but
// built from the same design tokens, icon set, and motion system as the
// rest of SchoolOS so it never feels like a different product.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import AnimatedLogo from '@/components/AnimatedLogo'
import { MoonIcon, SunIcon, CompassIcon, MenuIcon, XIcon } from '@/components/Icons'
import { useTheme } from '@/hooks/useTheme'
import motion from '@/components/dashboard-motion.module.css'
import styles from './PublicNav.module.css'

const NAV_LINKS = [
  { href: '/find-schools', label: 'Find Schools' },
]

export default function PublicNav() {
  const pathname = usePathname()
  const { theme, toggleTheme } = useTheme()
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Close the mobile menu on route change so a link tap always lands the
  // visitor on a clean page instead of a stale open overlay.
  useEffect(() => { setMenuOpen(false) }, [pathname])

  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <header className={`${styles.nav} ${scrolled ? styles.navScrolled : ''}`}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="SchoolOS home">
          <AnimatedLogo size={34} variant={theme === 'light' ? 'color' : 'dark-bg'} />
          <span className={styles.brandName}>School<span className={styles.brandAccent}>OS</span></span>
        </Link>

        <nav className={styles.linkRow} aria-label="Primary">
          {NAV_LINKS.map(link => (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.navLink} ${pathname === link.href ? styles.navLinkActive : ''}`}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.actions}>
          <button
            type="button"
            onClick={toggleTheme}
            className={`${styles.themeToggle} ${motion.pressable} ${motion.focusable}`}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
          </button>

          <Link href="/select-school" className={`${styles.loginLink} ${motion.focusable}`}>
            Login
          </Link>

          <Link href="/register-school" className={`btn btn-primary btn-sm ${styles.registerCta} ${motion.focusable}`}>
            Register your school
          </Link>

          <button
            type="button"
            className={`${styles.menuToggle} ${motion.pressable} ${motion.focusable}`}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen(o => !o)}
          >
            {menuOpen ? <XIcon size={20} /> : <MenuIcon size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className={`${styles.mobileMenu} ${motion.riseIn}`}>
          <Link href="/find-schools" className={styles.mobileLink} onClick={closeMenu}>
            <CompassIcon size={18} /> Find Schools
          </Link>
          <Link href="/select-school" className={styles.mobileLink} onClick={closeMenu}>
            Login
          </Link>
          <Link href="/register-school" className={`btn btn-primary ${styles.mobileRegister}`} onClick={closeMenu}>
            Register your school
          </Link>
        </div>
      )}
    </header>
  )
}
