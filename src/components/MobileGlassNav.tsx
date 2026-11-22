'use client'
// components/MobileGlassNav.tsx
// Glass sidebar drawer for phones and tablets. Opened by the BottomDock Menu
// button. Same anatomy as the desktop rail: brand block, grouped navigation
// with a real active state, theme pill, account row and sign out. The edge
// chevron collapses the panel to an icon rail with a springy width change and
// labels that fade out; tapping the scrim or pressing Escape closes it.

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import type { FeatureGroup } from './AllFeaturesSheet'
import { GridIcon, SparklesIcon, SunIcon, MoonIcon, UserIcon, LogOutIcon } from './Icons'
import { useTheme } from '@/hooks/useTheme'
import { useShellIdentity } from '@/lib/shellIdentity'
import { createClient } from '@/lib/supabase/client'
import { signOutFlow } from '@/lib/signOutFlow'
import styles from './MobileGlassNav.module.css'

interface Props {
  role:     string
  groups:   FeatureGroup[]
  aiHref:   string
  homeHref?: string
  profile?: any
  school?:  any
  onClose:  () => void
}

function roleLabelOf(role: string) {
  return role
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function MobileGlassNav({ role, groups, aiHref, homeHref, profile, school, onClose }: Props) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const shared = useShellIdentity()
  const [rail, setRail] = useState(false)

  const prof = profile ?? shared.profile
  const sch  = school ?? shared.school
  const resolvedHome    = homeHref ?? `/dashboard/${role}`
  const resolvedProfile = `/dashboard/${role}/profile`
  const roleLabel       = roleLabelOf(role)
  const initials        = (sch?.name ?? 'S').slice(0, 2).toUpperCase()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

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
  const onAi   = pathname === aiHref || pathname.startsWith(aiHref + '/')

  async function handleSignOut() {
    const supabase = createClient()
    await signOutFlow(supabase, router)
  }

  const itemClass = (active: boolean) => `${styles.item} ${active ? styles.itemActive : ''}`

  return (
    <>
      <div className={styles.scrim} onClick={onClose} aria-hidden="true" />
      <aside
        className={`${styles.panel} ${rail ? styles.rail : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Main navigation"
      >
        <button
          type="button"
          className={`${styles.edgeToggle} ${rail ? styles.flip : ''}`}
          onClick={() => setRail(r => !r)}
          aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!rail}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>

        <div className={styles.brandRow}>
          <div className={styles.crest}>
            {sch?.logo_url
              ? <Image src={sch.logo_url} alt="" width={40} height={40} className={styles.crestImg} />
              : initials}
          </div>
          <div className={styles.brandText}>
            <div className={styles.schoolName}>{sch?.name ?? 'Your school'}</div>
            <div className={styles.roleTag}>{roleLabel}</div>
          </div>
        </div>

        <nav className={styles.nav}>
          <Link
            href={resolvedHome}
            className={itemClass(onHome)}
            onClick={onClose}
            aria-current={onHome ? 'page' : undefined}
          >
            <span className={styles.icon}><GridIcon size={19} /></span>
            <span className={styles.label}>Overview</span>
          </Link>

          <Link
            href={aiHref}
            className={`${itemClass(onAi)} ${styles.aiItem}`}
            onClick={onClose}
            aria-current={onAi ? 'page' : undefined}
          >
            <span className={styles.icon}><SparklesIcon size={19} /></span>
            <span className={styles.label}>AI Insights</span>
          </Link>

          {groups.map(group => (
            <div key={group.name} className={styles.group}>
              <div className={styles.groupLabel}>{group.name}</div>
              {group.items.map(item => {
                const active = item.href === activeHref
                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={itemClass(active)}
                    onClick={onClose}
                    aria-current={active ? 'page' : undefined}
                  >
                    <span className={styles.icon}><item.Icon size={19} /></span>
                    <span className={styles.label}>{item.label}</span>
                  </Link>
                )
              })}
            </div>
          ))}
        </nav>

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.themePill}
            onClick={toggleTheme}
            aria-label="Toggle theme"
          >
            <span className={`${styles.themeOpt} ${theme === 'dark' ? styles.themeOn : ''}`}><MoonIcon size={15} /></span>
            <span className={`${styles.themeOpt} ${theme !== 'dark' ? styles.themeOn : ''}`}><SunIcon size={15} /></span>
          </button>

          <Link href={resolvedProfile} className={styles.account} onClick={onClose}>
            <span className={styles.avatar}>
              {prof?.avatar_url
                ? <Image src={prof.avatar_url} alt="" width={36} height={36} className={styles.avatarImg} />
                : <UserIcon size={16} />}
            </span>
            <span className={styles.accountText}>
              <span className={styles.accountName}>{prof?.full_name ?? 'Account'}</span>
              <span className={styles.accountRole}>{roleLabel}</span>
            </span>
          </Link>

          <button type="button" className={`${styles.item} ${styles.signOut}`} onClick={handleSignOut} aria-label="Sign out">
            <span className={styles.icon}><LogOutIcon size={17} color="var(--danger)" /></span>
            <span className={styles.label}>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
