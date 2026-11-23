'use client'
// components/MobileGlassNav.tsx
// Glass sidebar drawer for phones and tablets. Opened by the BottomDock Menu
// button (rises up from the bottom) or by the three-line button in the
// dashboard headers (slides in from the right). Same anatomy as the desktop
// rail: brand block, grouped navigation with a real active state, theme
// pill, account row and sign out. The edge chevron collapses the panel to an
// icon rail; tapping the scrim, a link, or pressing Escape plays the exit
// animation and closes it.

import Link from 'next/link'
import Image from 'next/image'
import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
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
  /** Where the panel grows from: the bottom dock (rises up) or a header button on the right (slides in from the right). */
  origin?:  'bottom' | 'right'
  onClose:  () => void
}

function roleLabelOf(role: string) {
  return role
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

export default function MobileGlassNav({ role, groups, aiHref, homeHref, profile, school, origin = 'bottom', onClose }: Props) {
  const pathname = usePathname() ?? ''
  const router = useRouter()
  const { theme, toggleTheme } = useTheme()
  const shared = useShellIdentity()
  const [rail, setRail] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const leavingRef = useRef(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Play the exit animation, then unmount.
  const requestClose = useCallback(() => {
    if (leavingRef.current) return
    leavingRef.current = true
    setLeaving(true)
    timerRef.current = setTimeout(onClose, 260)
  }, [onClose])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const prof = profile ?? shared.profile
  const sch  = school ?? shared.school
  const resolvedHome    = homeHref ?? `/dashboard/${role}`
  const resolvedProfile = `/dashboard/${role}/profile`
  const roleLabel       = roleLabelOf(role)
  const initials        = (sch?.name ?? 'S').slice(0, 2).toUpperCase()

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') requestClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [requestClose])

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
  let order = 0
  const stagger = (): CSSProperties => ({ ['--i' as string]: order++ } as CSSProperties)

  return (
    <>
      <div className={`${styles.scrim} ${leaving ? styles.scrimOut : ''}`} onClick={requestClose} aria-hidden="true" />
      <aside
        className={`${styles.panel} ${origin === 'right' ? styles.fromRight : styles.fromBottom} ${leaving ? styles.leaving : ''} ${rail ? styles.rail : ''}`}
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
            style={stagger()}
            onClick={requestClose}
            aria-current={onHome ? 'page' : undefined}
          >
            <span className={styles.icon}><GridIcon size={19} /></span>
            <span className={styles.label}>Overview</span>
          </Link>

          <Link
            href={aiHref}
            className={`${itemClass(onAi)} ${styles.aiItem}`}
            style={stagger()}
            onClick={requestClose}
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
                    style={stagger()}
                    onClick={requestClose}
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

          <Link href={resolvedProfile} className={styles.account} style={stagger()} onClick={requestClose}>
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

          <button type="button" className={`${styles.item} ${styles.signOut}`} style={stagger()} onClick={handleSignOut} aria-label="Sign out">
            <span className={styles.icon}><LogOutIcon size={17} color="var(--danger)" /></span>
            <span className={styles.label}>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  )
}
