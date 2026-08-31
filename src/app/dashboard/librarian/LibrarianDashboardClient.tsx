'use client'

import { useEffect, useState } from 'react'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import ContextSwitcher from '@/components/ContextSwitcher'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import { BookIcon, RefreshIcon, AiIcon, MessageIcon, BellIcon, UserIcon, CalendarIcon } from '@/components/Icons'
import styles from './librarian.module.css'
import motion from '@/components/dashboard-motion.module.css'

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Library', items: [
    { id: 'catalog',   label: 'Catalog',   href: '/dashboard/librarian/catalog',   Icon: BookIcon },
    { id: 'checkouts', label: 'Checkouts', href: '/dashboard/librarian/checkouts', Icon: RefreshIcon },
    { id: 'meetings',  label: 'Meetings',  href: '/dashboard/librarian/meetings',  Icon: CalendarIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/librarian/chat',          Icon: MessageIcon },
    { id: 'notifications', label: 'Notifications', href: '/dashboard/librarian/notifications', Icon: BellIcon },
  ]},
  { name: 'Account', items: [
    { id: 'ai',      label: 'AI Assistant', href: '/dashboard/librarian/ai',      Icon: AiIcon },
    { id: 'profile', label: 'My Profile',   href: '/dashboard/librarian/profile', Icon: UserIcon },
  ]},
]

interface Stats { totalBooks: number; openCheckouts: number; overdueCheckouts: number }
interface RecentCheckout {
  id: string; borrowed_at: string; due_at: string; returned_at: string | null
  book: { title: string } | { title: string }[] | null
  borrower: { full_name: string } | { full_name: string }[] | null
}
interface Props { userId: string; librarianName: string; school: any; stats: Stats; recentCheckouts: RecentCheckout[] }

function one<T>(v: T | T[] | null): T | null { return Array.isArray(v) ? (v[0] ?? null) : v }

function insightFor(stats: Stats) {
  if (stats.overdueCheckouts > 0) {
    return `${stats.overdueCheckouts} book${stats.overdueCheckouts === 1 ? ' is' : 's are'} overdue right now.`
  }
  if (stats.openCheckouts > 0) {
    return `${stats.openCheckouts} book${stats.openCheckouts === 1 ? ' is' : 's are'} currently checked out.`
  }
  return `${stats.totalBooks} title${stats.totalBooks === 1 ? '' : 's'} in the catalog. Everything's checked in.`
}

export default function LibrarianDashboardClient({ userId, librarianName, school, stats, recentCheckouts }: Props) {
  const [activities, setActivities] = useState<ActivityItem[]>([])
  const schoolColor = school?.primary_color ?? '#00B4D8'

  useEffect(() => {
    setActivities(recentCheckouts.map(c => {
      const book = one(c.book); const borrower = one(c.borrower)
      return {
        id: `checkout-${c.id}`,
        type: 'library_checkout',
        title: book?.title ?? 'A book',
        subtitle: `${borrower?.full_name ?? 'Borrower'} · ${c.returned_at ? 'Returned' : 'Checked out'}`,
        href: '/dashboard/librarian/checkouts',
        created_at: c.borrowed_at,
      }
    }))
  }, [recentCheckouts])

  return (
    <div>
      <RoleHeroHeader
        userId={userId}
        role="librarian"
        roleLabel="Librarian"
        profile={{ full_name: librarianName }}
        school={school}
        greeting={`Hello, ${librarianName.split(' ')[0] || 'Librarian'}`}
        headline="Library Dashboard"
        sub={`${stats.openCheckouts} book${stats.openCheckouts === 1 ? '' : 's'} out`}
        featureGroups={FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main}>
        <div className={`${motion.riseIn} ${styles.statsRow}`}>
          <div className={`glass-card ${motion.pressable} ${styles.statCard}`}>
            <GaugeStat label="Total books" value={stats.totalBooks} color="var(--brand)" caption="in catalog" />
          </div>
          <div className={`glass-card ${motion.pressable} ${styles.statCard}`}>
            <GaugeStat label="Checked out" value={stats.openCheckouts} color="var(--brand-2, var(--brand))" caption="right now" delayMs={80} />
          </div>
          <div className={`glass-card ${motion.pressable} ${styles.statCard}`}>
            <GaugeStat label="Overdue" value={stats.overdueCheckouts} color="var(--status-warn, #E4572E)" caption="past due" delayMs={160} />
          </div>
        </div>

        <AiInsightBanner
          insight={insightFor(stats)}
          actionLabel={stats.overdueCheckouts > 0 ? 'Review overdue →' : 'Open checkouts →'}
          actionHref="/dashboard/librarian/checkouts"
        />

        <p className={styles.sectionLabel}>Quick access</p>
        <div className={styles.quickLinkRow}>
          <a href="/dashboard/librarian/catalog" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><BookIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Catalog</span>
              <span className={styles.quickLinkCount}>{stats.totalBooks} titles</span>
            </span>
          </a>
          <a href="/dashboard/librarian/checkouts" className={`glass-card ${motion.pressable} ${styles.quickLink}`}>
            <span className={styles.quickLinkIcon}><RefreshIcon size={18} /></span>
            <span className={styles.quickLinkText}>
              <span className={styles.quickLinkLabel}>Checkouts</span>
              <span className={styles.quickLinkCount}>{stats.openCheckouts} out</span>
            </span>
          </a>
        </div>

        <RecentActivity items={activities} accentColor={schoolColor} emptyLabel="No checkouts yet. They'll show up here." />

        <div className={styles.spacer} />
      </main>

      <BottomDock aiHref="/dashboard/librarian/ai" groups={FEATURE_GROUPS} role="librarian" />
    </div>
  )
}
