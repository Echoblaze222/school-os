'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  WalletIcon, FileTextIcon, BarChartIcon,
  MessageIcon, DownloadIcon, PeopleIcon, ClockIcon,
  CheckCircleIcon, BellIcon, SettingsIcon, CalendarIcon,
  CreditCardIcon, ClipboardIcon, UploadIcon,
} from '@/components/Icons'
import styles from './bursar.module.css'
import motion from '@/components/dashboard-motion.module.css'

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Finance', items: [
    { id: 'fees',           label: 'Fee records',    href: '/dashboard/bursar/fees',           Icon: WalletIcon },
    { id: 'record-payment', label: 'Record payment', href: '/dashboard/bursar/record-payment', Icon: CreditCardIcon },
    { id: 'claims',         label: 'Payment claims', href: '/dashboard/bursar/claims',         Icon: UploadIcon },
    { id: 'payments',       label: 'Payments',       href: '/dashboard/bursar/payments',       Icon: CheckCircleIcon },
    { id: 'invoices',       label: 'Invoices',       href: '/dashboard/bursar/invoices',       Icon: FileTextIcon },
    { id: 'receipts',       label: 'Receipts',       href: '/dashboard/bursar/receipts',       Icon: ClipboardIcon },
    { id: 'expenses',       label: 'Expenses',       href: '/dashboard/bursar/expenses',       Icon: WalletIcon },
  ]},
  { name: 'Collections', items: [
    { id: 'debtors',   label: 'Debtors',   href: '/dashboard/bursar/debtors',   Icon: PeopleIcon },
    { id: 'reminders', label: 'Reminders', href: '/dashboard/bursar/reminders', Icon: BellIcon },
    { id: 'reports',   label: 'Reports',   href: '/dashboard/bursar/reports',   Icon: BarChartIcon },
    { id: 'export',    label: 'Export data',href: '/dashboard/bursar/export',   Icon: DownloadIcon },
    { id: 'history',   label: 'History',   href: '/dashboard/bursar/history',   Icon: ClockIcon },
  ]},
  { name: 'Communication', items: [
    { id: 'chat',          label: 'Messages',      href: '/dashboard/bursar/chat',          Icon: MessageIcon },
    { id: 'meetings',      label: 'Meetings',      href: '/dashboard/bursar/meetings',      Icon: CalendarIcon },
  ]},
  { name: 'Account', items: [
    { id: 'settings', label: 'Settings', href: '/dashboard/bursar/settings', Icon: SettingsIcon },
  ]},
]

interface Debtor { id: string; name: string; outstanding: number; term: string | null }
interface Props {
  profile: any; school: any; userId: string; counts?: any; activities: ActivityItem[]
  topDebtors?: Debtor[]
}

function buildInsight(counts: any, pendingClaims: number): string {
  if (pendingClaims > 0) {
    return `${pendingClaims} payment claim${pendingClaims === 1 ? '' : 's'} submitted by parents are waiting on your review. Approving them updates fee balances automatically.`
  }
  if ((counts.overdueCount ?? 0) > 0) {
    return `${counts.overdueCount} student${counts.overdueCount === 1 ? '' : 's'} ${counts.overdueCount === 1 ? 'is' : 'are'} past due on fees this term. A reminder push could help before it grows.`
  }
  return `Collection is at ${counts.collectionRate ?? 0}% for ${counts.currentTerm ?? 'this term'}, with no overdue balances right now.`
}

export default function BursarDashboardClient({
  profile, school, userId, counts = {}, activities, topDebtors = [],
}: Props) {
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'there'
  const supabase    = createClient()

  const [pendingClaims, setPendingClaims] = useState<number>(0)

  useEffect(() => {
    if (!school?.id) return
    fetchPendingClaims()

    const channel = supabase
      .channel('bursar-claims-badge')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'payment_claims', filter: `school_id=eq.${school.id}` },
        () => fetchPendingClaims()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [school?.id])

  async function fetchPendingClaims() {
    const { count } = await supabase
      .from('payment_claims')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id)
      .eq('status', 'pending')
    setPendingClaims(count ?? 0)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const totalCollected = counts.totalCollected ?? 0
  const collectionRate = counts.collectionRate ?? 0
  const headline = `₦${totalCollected.toLocaleString()} collected · ${collectionRate}% of fees`
  const sub = `${counts.currentTerm ?? 'This term'} · ${counts.totalStudents ?? 0} students`

  async function handleDeleteActivity(id: string) {
    const { error } = await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
    if (error) throw error
  }

  return (
    <div className={styles.page} style={{ background: 'color-mix(in srgb, var(--brand) 6%, var(--bg-base))' }}>
      <RoleHeroHeader
        userId={userId}
        role="bursar"
        roleLabel="Bursary"
        profile={profile}
        school={school}
        greeting={`${greeting}, ${firstName}`}
        headline={headline}
        sub={sub}
        featureGroups={FEATURE_GROUPS}
      />

      <main className={styles.main}>

        <div className={motion.riseIn} style={{
          display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12,
          marginTop: 'var(--space-6)', marginBottom: 'var(--space-4)',
        }}>
          <div className="glass-card-flat" style={{ padding: 18, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>Total Collected</p>
            <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
              ₦{totalCollected.toLocaleString()}
            </p>
            <p style={{ margin: 0, fontSize: '0.74rem', fontWeight: 600, color: 'var(--success)' }}>
              {collectionRate}% of fees · {counts.currentTerm ?? 'this term'}
            </p>
            <div style={{ display: 'flex', gap: 20, paddingTop: 10, marginTop: 2, borderTop: '1px solid var(--glass-border)' }}>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Paid students</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.paidCount ?? 0}</p>
              </div>
              <div>
                <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Enrolled</p>
                <p style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)' }}>{counts.totalStudents ?? 0}</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Collection rate</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }}>{collectionRate}%</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Claims pending</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: pendingClaims > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{pendingClaims}</p>
            </div>
            <div className="glass-card-flat" style={{ padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2 }}>
              <p style={{ margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }}>Overdue</p>
              <p style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: (counts.overdueCount ?? 0) > 0 ? 'var(--warning)' : 'var(--text-primary)' }}>{counts.overdueCount ?? 0}</p>
            </div>
          </div>
        </div>

        <div style={{ marginBottom: 'var(--space-4)' }}>
          <AiInsightBanner
            insight={buildInsight(counts, pendingClaims)}
            actionLabel="Review claims →"
            actionHref="/dashboard/bursar/claims"
          />
        </div>

        {topDebtors.length > 0 && (
          <div className={`glass-card ${motion.riseIn}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)', marginBottom: 'var(--space-4)' }}>
            <p className={styles.sectionLabel}>Top outstanding balances</p>
            {topDebtors.map(d => (
              <Link key={d.id} href="/dashboard/bursar/debtors" style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0', borderTop: '1px solid var(--glass-border)', textDecoration: 'none',
              }}>
                <div>
                  <p style={{ margin: 0, fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</p>
                  <p style={{ margin: 0, fontSize: '0.68rem', color: 'var(--text-muted)' }}>{d.term ?? ''}</p>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--warning)' }}>
                  ₦{d.outstanding.toLocaleString()}
                </p>
              </Link>
            ))}
          </div>
        )}

        <RecentActivity
          items={activities}
          accentColor={schoolColor}
          onDelete={handleDeleteActivity}
          emptyLabel="Nothing yet. Payments and claims will show up here"
        />

        <div className={styles.spacer} />
      </main>

      <BottomDock aiHref="/dashboard/bursar/ai" groups={FEATURE_GROUPS} role="bursar" />
      <ChatWidget userId={userId} role="bursar" schoolColor={schoolColor} />
    </div>
  )
}
