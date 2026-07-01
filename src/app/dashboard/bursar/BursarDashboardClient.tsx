'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import ChatWidget from '@/components/ChatWidget'
import RecentActivity, { ActivityItem } from '@/components/RecentActivity'   // ← NEW
import {
  HomeIcon, WalletIcon, FileTextIcon, BarChartIcon,
  MessageIcon, DownloadIcon, PeopleIcon, ClockIcon,
  CheckCircleIcon, BellIcon, SettingsIcon, CalendarIcon,
  CreditCardIcon, AiIcon, ClipboardIcon, UploadIcon,
} from '@/components/Icons'
import RoleNav from '@/components/RoleNav'
import styles from './bursar.module.css'
import motion from '@/components/dashboard-motion.module.css'               // ← NEW

const MODULES = [
  { id: 'fees',           label: 'Fee Records',      Icon: WalletIcon,      href: '/dashboard/bursar/fees',           accent: '#10B981', bg: '#1a4a3a' },
  { id: 'record-payment', label: 'Record Payment',   Icon: CreditCardIcon,  href: '/dashboard/bursar/record-payment', accent: '#06B6D4', bg: '#0a3040' },
  { id: 'claims',         label: 'Payment Claims',   Icon: UploadIcon,      href: '/dashboard/bursar/claims',         accent: '#F59E0B', bg: '#4a3510' },
  { id: 'payments',       label: 'Payments',         Icon: CheckCircleIcon, href: '/dashboard/bursar/payments',       accent: '#3B82F6', bg: '#1e3a5f' },
  { id: 'invoices',       label: 'Invoices',         Icon: FileTextIcon,    href: '/dashboard/bursar/invoices',       accent: '#A78BFA', bg: '#2d1060' },
  { id: 'receipts',       label: 'Receipts',         Icon: ClipboardIcon,   href: '/dashboard/bursar/receipts',       accent: '#F59E0B', bg: '#4a3510' },
  { id: 'expenses',       label: 'Expenses',         Icon: WalletIcon,      href: '/dashboard/bursar/expenses',       accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'reports',        label: 'Reports',          Icon: BarChartIcon,    href: '/dashboard/bursar/reports',        accent: '#8B5CF6', bg: '#2e1f5e' },
  { id: 'debtors',        label: 'Debtors',          Icon: PeopleIcon,      href: '/dashboard/bursar/debtors',        accent: '#EF4444', bg: '#5f1e1e' },
  { id: 'reminders',      label: 'Reminders',        Icon: BellIcon,        href: '/dashboard/bursar/reminders',      accent: '#EC4899', bg: '#5a1a40' },
  { id: 'export',         label: 'Export Data',      Icon: DownloadIcon,    href: '/dashboard/bursar/export',         accent: '#14B8A6', bg: '#0d3535' },
  { id: 'history',        label: 'History',          Icon: ClockIcon,       href: '/dashboard/bursar/history',        accent: '#F97316', bg: '#4a2810' },
  { id: 'chat',           label: 'Messages',         Icon: MessageIcon,     href: '/dashboard/bursar/chat',           accent: '#7C3AED', bg: '#2d1060' },
  { id: 'notifications',  label: 'Notifications',    Icon: BellIcon,        href: '/dashboard/bursar/notifications',  accent: '#F59E0B', bg: '#4a3510' },
  { id: 'ai',             label: 'AI Assistant',     Icon: AiIcon,          href: '/dashboard/bursar/ai',             accent: '#6EE7B7', bg: '#0d3530' },
  { id: 'meetings',       label: 'Meetings',         Icon: CalendarIcon,    href: '/dashboard/bursar/meetings',       accent: '#06B6D4', bg: '#0a3040' },
  { id: 'settings',       label: 'Settings',         Icon: SettingsIcon,    href: '/dashboard/bursar/settings',       accent: '#6B7280', bg: '#1e2a38' },
]

interface Props { profile: any; school: any; userId: string; counts?: any; activities: ActivityItem[] }

export default function BursarDashboardClient({ profile, school, userId, counts = {}, activities }: Props) {
  const pathname    = usePathname()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const firstName   = profile?.full_name?.split(' ')[0] ?? 'Bursar'
  const supabase    = createClient()

  const [pendingClaims, setPendingClaims] = useState<number>(0)

  useEffect(() => {
    if (!school?.id) return
    fetchPendingClaims()

    const channel = supabase
      .channel('bursar-claims-badge')
      .on(
        'postgres_changes',
        {
          event:  '*',
          schema: 'public',
          table:  'payment_claims',
          filter: `school_id=eq.${school.id}`,
        },
        () => fetchPendingClaims()
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [school?.id])

  async function fetchPendingClaims() {
    const { count } = await supabase
      .from('payment_claims')
      .select('id', { count: 'exact', head: true })
      .eq('school_id', school.id)
      .eq('status', 'pending')
    setPendingClaims(count ?? 0)
  }

  function isActive(href: string) {
    return pathname.startsWith(href)
  }

  const stats = [
    { label: 'Total Collected', value: `₦${((counts.totalCollected ?? 0) / 1000).toFixed(0)}k`, color: '#10B981' },
    { label: 'Outstanding',     value: `₦${((counts.outstanding  ?? 0) / 1000).toFixed(0)}k`,  color: '#EF4444' },
    { label: 'Paid Students',   value: counts.paidCount    ?? 0,                                 color: '#3B82F6' },
    { label: 'Pending',         value: counts.pendingCount ?? 0,                                 color: '#F59E0B' },
  ]

  // ── NEW: delete handler wired to Supabase ──────────────────────────────
  async function handleDeleteActivity(id: string) {
    await supabase.from('recent_activities').delete().eq('id', id).eq('user_id', userId)
  }

  return (
    <div className={styles.page}>
      <RoleNav
        userId={userId}
        profile={profile}
        school={school}
        role="bursar"
        schoolColor={schoolColor}
      />

      <div className={styles.content}>
        <DashboardHeader userId={userId} role="bursar" profile={profile} school={school} schoolColor={schoolColor} />

        <main className={styles.main}>
          <div className={`${styles.greeting} ${motion.riseIn}`}>
            <h1 className={styles.greetingName}>Hi, {firstName} <span className={motion.waveEmoji}>👋</span></h1>
            <p className={styles.greetingSub}>Financial overview · {counts.currentTerm ?? 'This Term'}</p>
          </div>

          {/* ── Pending Claims Alert Banner ─────────────────────── */}
          {pendingClaims > 0 && (
            <Link href="/dashboard/bursar/claims"
              className={`${motion.riseIn} ${motion.pressable}`}
              style={{
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
                padding:        '12px 16px',
                background:     '#F59E0B15',
                border:         '1px solid #F59E0B50',
                borderRadius:   12,
                marginBottom:   'var(--space-5)',
                textDecoration: 'none',
                gap:            12,
                animationDelay: '100ms',
              }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{
                  width:36, height:36, borderRadius:'50%',
                  background:'#F59E0B20', display:'flex',
                  alignItems:'center', justifyContent:'center', flexShrink:0,
                }}>
                  <UploadIcon size={18} color="#F59E0B"/>
                </div>
                <div>
                  <p style={{ fontSize:'0.82rem', fontWeight:800, color:'#F59E0B', margin:0 }}>
                    {pendingClaims} Payment {pendingClaims === 1 ? 'Claim' : 'Claims'} Awaiting Review
                  </p>
                  <p style={{ fontSize:'0.72rem', color:'var(--text-muted)', margin:'2px 0 0' }}>
                    Parents have submitted proof of payment — tap to review
                  </p>
                </div>
              </div>
              <span style={{
                background:'#F59E0B', color:'#fff', borderRadius:20,
                padding:'2px 10px', fontSize:'0.78rem', fontWeight:800, flexShrink:0,
              }}>
                {pendingClaims}
              </span>
            </Link>
          )}

          {/* ── Collection Progress Card ────────────────────────── */}
          <div className={`${styles.collectionCard} ${motion.riseIn}`} style={{ borderColor: schoolColor + '40', animationDelay: '160ms' }}>
            <div className={styles.colLeft}>
              <p className={styles.colLabel}>Collection</p>
              <p className={styles.colValue} style={{ color: schoolColor }}>
                {counts.collectionRate ?? 0}%
              </p>
            </div>
            <div className={styles.colRight}>
              <div className={styles.colTrack}>
                <div className={`${styles.colFill} ${motion.barFillIn}`}
                  style={{ width: `${counts.collectionRate ?? 0}%`, background: schoolColor, transformOrigin: 'left' }} />
              </div>
              <p className={styles.colSub}>of expected revenue collected this term</p>
            </div>
          </div>

          {/* ── Stats Row — staggered ───────────────────────────── */}
          <div className={styles.statsRow}>
            {stats.map((s, i) => (
              <div
                key={s.label}
                className={`${styles.statCard} ${motion.staggerItem} ${motion.pressable}`}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <p className={styles.statVal} style={{ color: s.color }}>{s.value}</p>
                <p className={styles.statLbl}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* ── Module Grid — staggered ──────────────────────────── */}
          <p className={styles.sectionLabel}>Finance Tools</p>
          <div className={styles.moduleGrid}>
            {MODULES.map((mod, i) => (
              <Link key={mod.id} href={mod.href}
                className={`${styles.moduleCard} ${motion.staggerItem} ${motion.pressable} ${isActive(mod.href) ? styles.moduleActive : ''}`}
                style={{ position: 'relative', animationDelay: `${220 + i * 30}ms` }}>
                <div className={styles.modIcon} style={{ background: mod.bg }}>
                  <mod.Icon size={22} color={mod.accent} />
                </div>
                <span className={styles.modLabel}>{mod.label}</span>

                {mod.id === 'claims' && pendingClaims > 0 && (
                  <span style={{
                    position:   'absolute',
                    top:        6,
                    right:      6,
                    background: '#EF4444',
                    color:      '#fff',
                    borderRadius: '50%',
                    width:      18,
                    height:     18,
                    fontSize:   '0.62rem',
                    fontWeight: 800,
                    display:    'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    lineHeight: 1,
                  }}>
                    {pendingClaims > 9 ? '9+' : pendingClaims}
                  </span>
                )}
              </Link>
            ))}
          </div>

          {/* NEW: Recent Activity feed */}
          <RecentActivity
            items={activities}
            accentColor={schoolColor}
            onDelete={handleDeleteActivity}
            emptyLabel="Nothing yet — payments and records will show up here"
          />

          <div className={styles.spacer} />
        </main>

        <ChatWidget userId={userId} role="bursar" schoolColor={schoolColor} />
      </div>
    </div>
  )
}
