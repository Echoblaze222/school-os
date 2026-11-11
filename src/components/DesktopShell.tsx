'use client'
// components/DesktopShell.tsx
// Desktop navigation rail for every role. Hidden below 1024px by CSS, so the
// mobile experience (hero header + BottomDock) is untouched.
//
// Mounted by RoleSubHeader and RoleHeroHeader (which pass their own
// featureGroups), by the legacy RoleNav and StudentNav (legacy), and by the
// server wrapper on the few pages that have a bespoke header. When
// featureGroups is omitted it is resolved from the role registry.
//
// Provides: grouped navigation with a real active state, a collapsible rail
// (remembered per browser), a Cmd/Ctrl+K command palette, theme toggle,
// AI Insights shortcut, account row and sign out.

import './desktop-shell.css'
import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { FeatureGroup } from './AllFeaturesSheet'
import CommandPalette from './CommandPalette'
import { GridIcon, SearchIcon, SparklesIcon, SunIcon, MoonIcon, UserIcon, LogOutIcon } from './Icons'
import { useTheme } from '@/hooks/useTheme'
import { createClient } from '@/lib/supabase/client'
import { signOutFlow } from '@/lib/signOutFlow'
import { getFeatureGroups } from '@/lib/roleFeatureGroups'
import motion from './dashboard-motion.module.css'
import styles from './DesktopShell.module.css'

interface Props {
  role:           string
  profile:        any
  school:         any
  featureGroups?: FeatureGroup[]
  homeHref?:      string
  aiHref?:        string
  /** Page already offsets its content by --sidebar-width (RoleNav, StudentNav
   *  and their consumers). The shell then feeds that variable instead of
   *  padding the body, so nothing is offset twice. */
  legacy?:        boolean
  /** Dashboard home screen. Lets desktop-shell.css flow the cards in columns. */
  home?:          boolean
}

const COLLAPSE_KEY = 'schoolos.shell.collapsed'

function roleLabelOf(role: string) {
  return role
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function DesktopShell({
  role, profile, school, featureGroups, homeHref, aiHref, legacy = false, home = false,
}: Props) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [isMac, setIsMac] = useState(false)

  const groups: FeatureGroup[] = featureGroups ?? getFeatureGroups(role) ?? []

  const resolvedHome    = homeHref ?? `/dashboard/${role}`
  const resolvedAi      = aiHref ?? `/dashboard/${role}/ai`
  const resolvedProfile = `/dashboard/${role}/profile`
  const roleLabel       = roleLabelOf(role)
  const initials        = (school?.name ?? 'S').slice(0, 2).toUpperCase()

  // Remembered collapse state. Read after mount so server and client markup match.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true)
    } catch { /* storage can be unavailable; default to expanded */ }
    setIsMac(/Mac|iPhone|iPad/.test(navigator.userAgent))
  }, [])

  function toggleCollapsed() {
    setCollapsed(prev => {
      const next = !prev
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0') } catch { /* ignore */ }
      return next
    })
  }

  async function handleSignOut() {
    const supabase = createClient()
    await signOutFlow(supabase, router)
  }

  // Cmd/Ctrl + K opens the palette from anywhere on the page.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(open => !open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Longest matching href wins, so a parent route never lights up next to its child.
  const activeHref = useMemo(() => {
    let best = ''
    for (const g of groups) {
      for (const item of g.items) {
        const h = item.href
        if ((pathname === h || pathname.startsWith(h + '/')) && h.length > best.length) best = h
      }
    }
    return best
  }, [groups, pathname])

  const onHome = pathname === resolvedHome
  const onAi   = pathname === resolvedAi || pathname.startsWith(resolvedAi + '/')

  const itemClass = (active: boolean) =>
    `${styles.item} ${active ? styles.itemActive : ''} ${motion.focusable}`

  return (
    <>
      {home && <span className="sos-home-marker" hidden />}
      <aside
        className={`sos-shell ${legacy ? 'sos-shell-legacy' : ''} ${styles.shell} ${collapsed ? styles.collapsed : ''}`}
        data-collapsed={collapsed ? 'true' : 'false'}
        aria-label="Main navigation"
      >
        <div className={styles.brandRow}>
          <div className={styles.crest}>
            {school?.logo_url
              ? <Image src={school.logo_url} alt="" width={36} height={36} className={styles.crestImg} />
              : initials}
          </div>
          {!collapsed && (
            <div className={styles.brandText}>
              <div className={styles.schoolName}>{school?.name ?? 'Your school'}</div>
              <div className={styles.roleTag}>{roleLabel}</div>
            </div>
          )}
        </div>

        <button
          type="button"
          className={`${styles.searchBtn} ${motion.focusable}`}
          onClick={() => setPaletteOpen(true)}
          title="Search or jump to"
          aria-label="Search or jump to"
        >
          <SearchIcon size={15} />
          {!collapsed && (
            <>
              <span className={styles.searchText}>Search or jump to</span>
              <kbd className={styles.kbd}>{isMac ? '\u2318K' : 'Ctrl K'}</kbd>
            </>
          )}
        </button>

        <nav className={styles.nav}>
          <Link
            href={resolvedHome}
            className={itemClass(onHome)}
            title={collapsed ? 'Overview' : undefined}
            aria-current={onHome ? 'page' : undefined}
          >
            <span className={styles.icon}><GridIcon size={18} /></span>
            {!collapsed && <span className={styles.label}>Overview</span>}
          </Link>

          {groups.map(group => (
            <div key={group.name} className={styles.group}>
              {collapsed
                ? <div className={styles.groupRule} />
                : <div className={styles.groupLabel}>{group.name}</div>}
              {group.items.map(item => {
                const active = item.href === activeHref
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={itemClass(active)}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={styles.icon}><item.Icon size={18} /></span>
                    {!collapsed && <span className={styles.label}>{item.label}</span>}
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className={styles.footer}>
          <Link
            href={resolvedAi}
            className={`${itemClass(onAi)} ${styles.aiItem}`}
            title={collapsed ? 'AI Insights' : undefined}
            aria-current={onAi ? 'page' : undefined}
          >
            <span className={styles.icon}><SparklesIcon size={18} /></span>
            {!collapsed && <span className={styles.label}>AI Insights</span>}
          </Link>

          <button
            type="button"
            className={itemClass(false)}
            onClick={toggleTheme}
            title={collapsed ? 'Toggle theme' : undefined}
            aria-label="Toggle theme"
          >
            <span className={styles.icon}>
              {theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />}
            </span>
            {!collapsed && <span className={styles.label}>{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>}
          </button>

          <button
            type="button"
            className={itemClass(false)}
            onClick={toggleCollapsed}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            <span className={`${styles.icon} ${collapsed ? styles.flip : ''}`}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M11 17l-5-5 5-5" />
                <path d="M18 17l-5-5 5-5" />
              </svg>
            </span>
            {!collapsed && <span className={styles.label}>Collapse</span>}
          </button>

          <Link
            href={resolvedProfile}
            className={`${styles.account} ${motion.focusable}`}
            title={collapsed ? 'Account' : undefined}
          >
            <span className={styles.avatar}>
              {profile?.avatar_url
                ? <Image src={profile.avatar_url} alt="" width={34} height={34} className={styles.avatarImg} />
                : <UserIcon size={16} />}
            </span>
            {!collapsed && (
              <span className={styles.accountText}>
                <span className={styles.accountName}>{profile?.full_name ?? 'Account'}</span>
                <span className={styles.accountRole}>{roleLabel}</span>
              </span>
            )}
          </Link>

          <button
            type="button"
            className={`${itemClass(false)} ${styles.signOut}`}
            onClick={handleSignOut}
            title={collapsed ? 'Sign out' : undefined}
            aria-label="Sign out"
          >
            <span className={styles.icon}><LogOutIcon size={16} color="var(--danger)" /></span>
            {!collapsed && <span className={styles.label}>Sign out</span>}
          </button>
        </div>
      </aside>

      {paletteOpen && (
        <CommandPalette
          groups={groups}
          homeHref={resolvedHome}
          aiHref={resolvedAi}
          profileHref={resolvedProfile}
          theme={theme}
          onToggleTheme={toggleTheme}
          onClose={() => setPaletteOpen(false)}
        />
      )}
    </>
  )
}
