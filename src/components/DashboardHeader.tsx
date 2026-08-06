'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { signOutFlow } from '@/lib/signOutFlow'
import NotificationsBell from './NotificationsBell'
import { SunIcon, MoonIcon, UserIcon, ArrowLeftIcon } from './Icons'
import { useTheme } from '@/hooks/useTheme'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'
import styles from './DashboardHeader.module.css'

interface Props {
  userId:      string
  role:        string
  profile:     any
  school:      any
  title?:      string
  showBack?:   boolean
  schoolColor?: string
}

// Sub-page header — same prop API as before, but now the compact sibling
// of RoleHeroHeader: same brand gradient band, same crest/pill treatment,
// same icon set, just shorter (no greeting/headline copy, since a sub-page
// needs a title bar, not a hero). Consuming pages need zero changes —
// this only replaces what RolePageWrapper renders internally.
export default function DashboardHeader({
  userId, role, profile, school,
  title, showBack = false, schoolColor = '#800020',
}: Props) {
  const { theme, toggleTheme } = useTheme()
  const router  = useRouter()
  const supabase = createClient()
  const firstName = profile?.full_name?.split(' ')[0] ?? role

  async function handleLogout() {
    await signOutFlow(supabase, router)
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {showBack
          ? <button
              className={`${styles.iconBtn} ${motion.rippleHost} ${motion.focusable}`}
              onClick={() => router.back()}
              onMouseDown={ripple(motion)}
              aria-label="Back"
            >
              <ArrowLeftIcon size={17} />
            </button>
          : <div className={styles.schoolBadge}>
              {school?.logo_url
                ? <img src={school.logo_url} alt="" className={styles.schoolLogo} />
                : <span>{school?.name?.[0] ?? 'S'}</span>
              }
            </div>
        }
        <div>
          {title
            ? <p className={styles.pageTitle}>{title}</p>
            : <p className={styles.pageTitle}>{school?.name ?? 'SchoolOS'}</p>
          }
          {!showBack && (
            <p className={styles.pageSubtitle}>
              {role.charAt(0).toUpperCase() + role.slice(1)} Portal
            </p>
          )}
        </div>
      </div>

      <div className={styles.right}>
        <button
          className={`${styles.iconBtn} ${motion.rippleHost} ${motion.focusable}`}
          onClick={toggleTheme}
          onMouseDown={ripple(motion)}
          aria-label="Toggle theme"
        >
          {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        </button>

        <NotificationsBell userId={userId} role={role} />

        <Link
          href={`/dashboard/${role}/profile`}
          className={`${styles.avatar} ${motion.focusable}`}
          aria-label="Account"
        >
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt={firstName} className={styles.avatarImg} />
            : <UserIcon size={14} color="#F6F1E4" />
          }
        </Link>
      </div>
    </header>
  )
}
