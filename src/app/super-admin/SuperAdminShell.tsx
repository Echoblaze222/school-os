'use client'
// src/app/super-admin/SuperAdminShell.tsx
// Single source of truth for super-admin navigation, used by layout.tsx so
// every page under /super-admin gets it - previously only the Schools page
// (SuperAdminDashboard.tsx) had a sidebar hardcoded into itself, so every
// other page (Content, Revenue, Reports, Promotions, Settings) was a
// dead end with no way back except the browser back button, and on
// screens under 768px the sidebar disappeared entirely with no fallback,
// leaving no navigation at all.
//
// Renders nothing (no chrome) on /super-admin/login, since that's the
// pre-auth screen. /super-admin/hq gets the same shell as everywhere
// else for easy navigation once you're in - it just isn't one of the
// items in NAV_ITEMS below, so it stays out of the visible list.

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SchoolIcon, BarChartIcon, WalletIcon, BookOpenIcon, StarIcon,
  AlertCircleIcon, BellIcon, SettingsIcon, LogOutIcon, MenuIcon, XIcon,
} from '@/components/Icons'
import styles from './super-admin-shell.module.css'

const NAV_ITEMS = [
  { icon: SchoolIcon,      label: 'Schools',    href: '/super-admin/schools' },
  { icon: BarChartIcon,    label: 'Analytics',  href: null },
  { icon: WalletIcon,      label: 'Revenue',    href: '/super-admin/revenue' },
  { icon: BookOpenIcon,    label: 'Content',    href: '/super-admin/content' },
  { icon: StarIcon,        label: 'Promotions', href: '/super-admin/promotions' },
  { icon: AlertCircleIcon, label: 'Reports',    href: '/super-admin/reports' },
  { icon: BellIcon,        label: 'Alerts',     href: null },
  { icon: SettingsIcon,    label: 'Settings',   href: '/super-admin/settings' },
]

export default function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const supabase = createClient()

  if (pathname === '/super-admin/login') return <>{children}</>

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/super-admin/login'
  }

  function isActive(href: string | null) {
    if (!href) return false
    return pathname === href || pathname.startsWith(href + '/')
  }

  const navLinks = (onNavigate?: () => void) => NAV_ITEMS.map(item => (
    item.href ? (
      <Link key={item.label} href={item.href} onClick={onNavigate}
        className={`${styles.navItem} ${isActive(item.href) ? styles.navActive : ''}`}>
        <item.icon size={17} />
        <span>{item.label}</span>
      </Link>
    ) : (
      <button key={item.label} disabled className={styles.navItem} title="Coming soon"
        style={{ opacity: 0.4, cursor: 'not-allowed' }}>
        <item.icon size={17} />
        <span>{item.label}</span>
      </button>
    )
  ))

  return (
    <div className={styles.shell}>
      {/* ── DESKTOP SIDEBAR ─────────────────────────────── */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarTop}>
          <div className={styles.brand}>
            <div className={styles.brandIcon}><SchoolIcon size={22} color="white" /></div>
            <div>
              <p className={styles.brandName}>SchoolOS</p>
              <p className={styles.brandSub}>Super Admin</p>
            </div>
          </div>
        </div>
        <nav className={styles.sidebarNav}>{navLinks()}</nav>
        <button className={styles.logoutBtn} onClick={handleLogout}>
          <LogOutIcon size={15} color="var(--danger)" />
          <span>Sign Out</span>
        </button>
      </aside>

      {/* ── MOBILE TOP BAR ──────────────────────────────── */}
      <div className={styles.mobileTopBar}>
        <div className={styles.brand}>
          <div className={styles.brandIcon}><SchoolIcon size={18} color="white" /></div>
          <p className={styles.brandName}>SchoolOS <span className={styles.brandSub}>Super Admin</span></p>
        </div>
        <button className={styles.hamburgerBtn} onClick={() => setDrawerOpen(true)} aria-label="Open menu">
          <MenuIcon size={22} />
        </button>
      </div>

      {/* ── MOBILE DRAWER ───────────────────────────────── */}
      {drawerOpen && (
        <div className={styles.drawerOverlay} onClick={() => setDrawerOpen(false)}>
          <div className={styles.drawer} onClick={e => e.stopPropagation()}>
            <div className={styles.drawerHeader}>
              <div className={styles.brand}>
                <div className={styles.brandIcon}><SchoolIcon size={20} color="white" /></div>
                <div>
                  <p className={styles.brandName}>SchoolOS</p>
                  <p className={styles.brandSub}>Super Admin</p>
                </div>
              </div>
              <button className={styles.closeBtn} onClick={() => setDrawerOpen(false)} aria-label="Close menu">
                <XIcon size={20} />
              </button>
            </div>
            <nav className={styles.sidebarNav}>{navLinks(() => setDrawerOpen(false))}</nav>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              <LogOutIcon size={15} color="var(--danger)" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}

      {/* ── PAGE CONTENT ────────────────────────────────── */}
      <div className={styles.content}>{children}</div>
    </div>
  )
}
