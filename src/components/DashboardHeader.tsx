'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import NotificationsBell from './NotificationsBell'
import { SunIcon, MoonIcon, LogOutIcon, UserIcon, ArrowLeftIcon } from './Icons'
import { useTheme } from '@/hooks/useTheme'
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

export default function DashboardHeader({
  userId, role, profile, school,
  title, showBack = false, schoolColor = '#7C3AED',
}: Props) {
  const { theme, toggleTheme } = useTheme()
  const router  = useRouter()
  const supabase = createClient()
  const firstName = profile?.full_name?.split(' ')[0] ?? role

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <header className={styles.header}>
      <div className={styles.left}>
        {showBack
          ? <button className={styles.iconBtn} onClick={() => router.back()}>
              <ArrowLeftIcon size={18} />
            </button>
          : <div className={styles.schoolBadge} style={{ background: schoolColor }}>
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
        <button className={styles.iconBtn} onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        </button>

        <NotificationsBell userId={userId} role={role} />

        <Link
          href={`/dashboard/${role}/profile`}
          className={styles.avatar}
          style={{ background: schoolColor }}
        >
          {profile?.avatar_url
            ? <img src={profile.avatar_url} alt={firstName} className={styles.avatarImg} />
            : <UserIcon size={14} color="white" />
          }
        </Link>
      </div>
    </header>
  )
}
