'use client'
// components/StudentNav.tsx
// Student pages that predate RoleSubHeader. The desktop sidebar is now the
// shared DesktopShell (same data as every other role); the mobile bottom nav
// is unchanged.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import React from 'react'
import { HomeIcon, BookIcon, BarChartIcon, MessageIcon, AiIcon } from './Icons'
import DesktopShell from './DesktopShell'
import styles from './StudentNav.module.css'

type IconComponent = (props: { size?: number; color?: string; strokeWidth?: number }) => React.ReactElement

interface Props {
  userId:      string
  profile:     any
  school:      any
  schoolColor?: string
}

interface NavItem {
  href:   string
  Icon:   IconComponent
  label:  string
  home?:  never
}
interface HomeItem {
  href:  string
  home:  true
  Icon?: never
  label?: never
}
type BottomNavItem = NavItem | HomeItem

const BOTTOM_NAV: BottomNavItem[] = [
  { href: '/dashboard/student/notes',   Icon: BookIcon,      label: 'Learn'   },
  { href: '/dashboard/student/results', Icon: BarChartIcon,  label: 'Results' },
  { href: '/dashboard/student',         home: true                             },
  { href: '/dashboard/student/chat',    Icon: MessageIcon,   label: 'Chat'    },
  { href: '/dashboard/student/ai',      Icon: AiIcon,        label: 'AI'      },
]

export default function StudentNav({ profile, school, schoolColor = '#7C3AED' }: Props) {
  const pathname = usePathname()

  function isActive(href: string, isHome?: boolean) {
    if (isHome) return pathname === '/dashboard/student'
    if (href === '/dashboard/student') return pathname === href
    return pathname.startsWith(href)
  }

  return (
    <>
      <DesktopShell legacy role="student" profile={profile} school={school} />

      {/* -- MOBILE BOTTOM NAV ------------------------------ */}
      <nav className={styles.bottomNav}>
        {BOTTOM_NAV.map((item) => {
          if (item.home) {
            return (
              <Link
                key="home"
                href="/dashboard/student"
                className={styles.homeBtn}
                style={{ background: schoolColor }}
                aria-label="Home"
              >
                <HomeIcon size={20} color="#fff" strokeWidth={2} />
              </Link>
            )
          }
          // Explicit narrowing: the installed TS/React types did not resolve the
          // discriminant automatically, which surfaced as "Icon does not have any
          // construct or call signatures". Assert instead of loosening the type.
          const navItem = item as unknown as NavItem
          const Icon   = navItem.Icon
          const active = isActive(navItem.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navPill} ${active ? styles.navPillActive : ''}`}
              style={active ? { color: schoolColor } as React.CSSProperties : undefined}
            >
              <Icon size={20} color={active ? schoolColor : undefined} />
              <span style={active ? { color: schoolColor } : undefined}>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </>
  )
}
