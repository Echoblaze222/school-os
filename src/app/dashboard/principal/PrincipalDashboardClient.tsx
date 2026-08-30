'use client'

import Link from 'next/link'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import GaugeStat from '@/components/GaugeStat'
import KpiCard from '@/components/KpiCard'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  PeopleIcon, SchoolIcon, WalletIcon,
  MessageIcon, BellIcon, ClipboardIcon,
  SettingsIcon, MegaphoneIcon, VideoIcon,
  FileTextIcon, TrophyIcon, KeyIcon, UserIcon,
  LayersIcon, CalendarIcon, GlobeIcon, RefreshIcon, GraduationCapIcon,
  ShieldIcon, TagIcon, BarChartIcon, StarIcon,
} from '@/components/Icons'
import styles from './principal.module.css'
import motion from '@/components/dashboard-motion.module.css'

// Real routes for this role - grouped for the All-features sheet.
// Kept in one place so the sheet can never drift from what actually exists.
const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'People', items: [
    { id: 'staff',    label: 'Staff',    href: '/dashboard/principal/staff',    Icon: PeopleIcon },
    { id: 'teachers', label: 'Teachers', href: '/dashboard/principal/teachers', Icon: UserIcon },
    { id: 'students', label: 'Students', href: '/dashboard/principal/students', Icon: SchoolIcon },
    { id: 'leadership', label: 'Leadership', href: '/dashboard/principal/leadership', Icon: TrophyIcon },
    { id: 'alumni',   label: 'Alumni',   href: '/dashboard/principal/alumni',   Icon: GlobeIcon },
    { id: 'certificates', label: 'Certificates', href: '/dashboard/principal/certificates', Icon: GraduationCapIcon },
    { id: 'transfers',label: 'Transfers',href: '/dashboard/principal/transfers',Icon: RefreshIcon },
  ]},
  { name: 'Academics', items: [
    { id: 'classes',     label: 'Classes',     href: '/dashboard/principal/classes',     Icon: LayersIcon },
    { id: 'results',     label: 'Results',     href: '/dashboard/principal/results',     Icon: TrophyIcon },
    { id: 'report-cards',label: 'Report cards',href: '/dashboard/principal/report-cards',Icon: FileTextIcon },
    { id: 'analytics',   label: 'Analytics',   href: '/dashboard/principal/analytics',   Icon: BarChartIcon },
    { id: 'assignments', label: 'Assignments', href: '/dashboard/principal/assignments', Icon: ClipboardIcon },
    { id: 'codes',       label: 'Access codes',href: '/dashboard/principal/codes',       Icon: KeyIcon },
  ]},
  { name: 'Finance', items: [
    { id: 'fees',          label: 'Fees',          href: '/dashboard/principal/fees',          Icon: WalletIcon },
    { id: 'reports',       label: 'Reports',       href: '/dashboard/principal/reports',       Icon: FileTextIcon },
    { id: 'subscriptions', label: 'Subscriptions', href: '/dashboard/principal/subscriptions', Icon: ShieldIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/principal/chat',          Icon: MessageIcon },
    { id: 'notices',       label: 'Notices',       href: '/dashboard/principal/notices',       Icon: BellIcon },
    { id: 'announcements', label: 'Announcements', href: '/dashboard/principal/announcements', Icon: MegaphoneIcon },
    { id: 'promotions',    label: 'Promotions',    href: '/dashboard/principal/promotions',    Icon: StarIcon },
    { id: 'meetings',      label: 'Meetings',      href: '/dashboard/principal/meetings',      Icon: CalendarIcon },
    { id: 'live',          label: 'Live classes',  href: '/dashboard/principal/live',          Icon: VideoIcon },
  ]},
  { name: 'Account', items: [
    { id: 'profile',  label: 'Profile',  href: '/dashboard/principal/profile',  Icon: UserIcon },
    { id: 'branding', label: 'Branding', href: '/dashboard/principal/settings', Icon: TagIcon },
    { id: 'settings', label: 'Settings', href: '/dashboard/principal/settings', Icon: SettingsIcon },
  ]},
]

interface PendingNotif { id: string; title: string; body: string; type: string; created_at: string; href: string }
interface Props {
  profile: any; school: any; userId: string; counts?: any; activities: ActivityItem[]
  pendingNotifications?: PendingNotif[]
  unreadNotifCount?: number
}

function notifRelTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

// Picks the lowest-scoring class-relevant signal we actually have to
// surface as the AI insight, instead of a generic static line.
function buildInsight(counts: any): string {
  if ((counts.feeCollectionRate ?? 0) < 60) {
    return `Fee collection is at ${counts.feeCollectionRate}% this term, below the usual pace by this point. Worth a reminder push to outstanding families.`
  }
  if ((counts.avgScore ?? 0) < 50) {
    return `Average score across recent results is ${counts.avgScore}%, worth a look at which classes are pulling this down.`
  }
  return `Fee collection is at ${counts.feeCollectionRate ?? 0}% and average score is ${counts.avgScore ?? 0}% this term, both tracking normally. ${counts.pendingActions ?? 0} items are waiting on your review.`
}

export default function PrincipalDashboardClient({
  profile, school, userId, counts = {}, activities,
  pendingNotifications = [], unreadNotifCount = 0,
}: Props) {
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName = profile?.full_name?.split(' ')[0] ?? 'Principal'

  async function handleDeleteActivity(id: string) {
    const { createClient } = await import('@/lib/supabase/client')
    const supabase = createClient()
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

  return (
    <div
      className={styles.page}
      style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}
    >
      <RoleHeroHeader
        userId={userId}
        role="principal"
        roleLabel="Principal's Desk"
        profile={profile}
        school={school}
        greeting={`Good day, ${firstName}`}
        headline="Here's how the school stands today."
        sub={`${counts.studentCount ?? 0} students on roll · ${counts.teacherCount ?? 0} staff`}
        featureGroups={FEATURE_GROUPS}
        showBranding
      />

      <main className={styles.main} style={{ maxWidth: 880 }}>

        {/* Top-level school metrics as proper KPI cards - prompt §6/§7:
            label + dominant number + icon + short context. No trend
            shown here since there's no real prior-period comparison
            queried yet - a fabricated trend would violate §6's "do not
            fabricate numbers" rule more than an absent one costs us. */}
        <div className={styles.statsRow} style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
          <KpiCard label="Students" value={counts.studentCount ?? 0} icon={<SchoolIcon size={16} />} context="On roll" />
          <KpiCard label="Teachers" value={counts.teacherCount ?? 0} icon={<UserIcon size={16} />} context="Active staff" />
          <KpiCard label="Classes" value={counts.classCount ?? 0} icon={<LayersIcon size={16} />} context="This session" />
          <KpiCard label="Fees Collected" value={counts.feesCollectedDisplay ?? '—'} icon={<WalletIcon size={16} />} context="This term" />
          <KpiCard label="Outstanding Fees" value={counts.outstandingFeesDisplay ?? '—'} icon={<WalletIcon size={16} />} context="Requires attention" color="var(--status-warn, #E4572E)" />
        </div>

        {/* Animated graphical stats - the numbers that matter most, as gauges */}
        <div className={motion.riseIn} style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 12,
          marginTop: 'var(--space-6)', marginBottom: 'var(--space-4)',
        }}>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Fee collection" value={counts.feeCollectionRate ?? 0} isPercent
              color="var(--brand-2, var(--brand))" caption="this term" />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Average score" value={counts.avgScore ?? 0} isPercent
              color="var(--status-ok, #3FA66B)" caption="recent results" delayMs={80} />
          </div>
          <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', overflow: 'hidden' }}>
            <GaugeStat label="Waiting on you" value={counts.pendingActions ?? 0}
              color="var(--status-warn, #E4572E)" caption="unread items" delayMs={160} />
          </div>
        </div>

        {/* AI Insight - one concrete, current observation, not a static blurb */}
        <div style={{ marginBottom: 'var(--space-4)' }}>
          <AiInsightBanner
            insight={buildInsight(counts)}
            actionLabel="Open AI Insights →"
            actionHref="/dashboard/principal/ai"
          />
        </div>

        {/* Pending notifications preview */}
        {pendingNotifications.length > 0 && (
          <div className={`${styles.notifCard} ${motion.riseIn}`} style={{ animationDelay: '160ms' }}>
            <div className={styles.notifCardHeader}>
              <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>
                Pending Notifications {unreadNotifCount > 0 && <span className={styles.notifCountBadge}>{unreadNotifCount}</span>}
              </p>
              <Link href="/dashboard/principal/notifications" className={styles.notifViewAll}>View All</Link>
            </div>
            {pendingNotifications.map(n => (
              <Link key={n.id} href={n.href} className={styles.notifRow}>
                <span className={styles.notifDot} style={{ background: schoolColor }} />
                <div className={styles.notifBody}>
                  <p className={styles.notifTitle}>{n.title}</p>
                  <p className={styles.notifText}>{n.body}</p>
                </div>
                <span className={styles.notifTime}>{notifRelTime(n.created_at)}</span>
              </Link>
            ))}
          </div>
        )}

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet. School-wide actions will show up here"
        />

        <div className={styles.spacer} />
      </main>

      <BottomDock aiHref="/dashboard/principal/ai" groups={FEATURE_GROUPS} role="principal" />
      <ChatWidget userId={userId} role="principal" schoolColor={schoolColor} />
    </div>
  )
}
