'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import RoleHeroHeader from '@/components/RoleHeroHeader'
import ContextSwitcher from '@/components/ContextSwitcher'
import GaugeStat from '@/components/GaugeStat'
import AiInsightBanner from '@/components/AiInsightBanner'
import BottomDock from '@/components/BottomDock'
import { FeatureGroup } from '@/components/AllFeaturesSheet'
import {
  UsersIcon, LayersIcon, CheckCircleIcon, AlertCircleIcon, AlertIcon,
  ClockIcon, HomeIcon, CalendarIcon,
} from '@/components/Icons'
import styles from './hostel.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Hostel { id: string; name: string; gender: string | null }
interface Summary {
  boardingStudentCount: number; accountedFor: number
  bedsAvailable: number; bedsOccupied: number; vacantRooms: number
  absent: number; onLeave: number; lateReturns: number
  openIncidents: number; openMaintenance: number; e2Pending: boolean
}

const FEATURE_GROUPS: FeatureGroup[] = [
  { name: 'Hostel', items: [
    { id: 'rooms',    label: 'Rooms & beds', href: '/dashboard/hostel/rooms',     Icon: LayersIcon },
    { id: 'rollcall', label: 'Roll call',    href: '/dashboard/hostel/roll-call', Icon: CheckCircleIcon },
    { id: 'leave',       label: 'Leave requests', href: '/dashboard/hostel/leave',       Icon: CalendarIcon },
    { id: 'incidents',   label: 'Incidents',      href: '/dashboard/hostel/incidents',   Icon: AlertIcon },
    { id: 'maintenance', label: 'Maintenance',    href: '/dashboard/hostel/maintenance', Icon: AlertCircleIcon },
  ]},
]

const ROLE_LABEL: Record<string, string> = {
  warden: 'Warden', assistant_warden: 'Assistant Warden',
  house_parent: 'House Parent', hostel_administrator: 'Hostel Administrator',
  principal: 'Principal',
}

function buildInsight(summary: Summary | null, occupancyRate: number): string {
  if (!summary) return 'Loading hostel data…'
  if (summary.absent > 0) {
    return `${summary.absent} student${summary.absent === 1 ? '' : 's'} unaccounted for at the latest roll call.`
  }
  if (summary.openIncidents > 0) {
    return `${summary.openIncidents} open incident${summary.openIncidents === 1 ? '' : 's'} still need${summary.openIncidents === 1 ? 's' : ''} resolution.`
  }
  if (summary.lateReturns > 0) {
    return `${summary.lateReturns} student${summary.lateReturns === 1 ? '' : 's'} returned late from leave, worth a check-in.`
  }
  if (summary.openMaintenance > 0) {
    return `${summary.openMaintenance} maintenance request${summary.openMaintenance === 1 ? '' : 's'} still open.`
  }
  return `Bed occupancy is ${occupancyRate}%, nothing urgent flagged right now.`
}

export default function HostelDashboardClient({
  school, hostels, appointmentType,
}: { school: any; hostels: Hostel[]; appointmentType: string }) {
  const [selectedHostelId, setSelectedHostelId] = useState<string>(hostels[0]?.id ?? '')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  async function load() {
    setStatus('loading')
    try {
      const url = selectedHostelId
        ? `/api/hostel/dashboard-summary?hostelId=${selectedHostelId}`
        : '/api/hostel/dashboard-summary'
      const res = await fetch(url)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setSummary(data)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [selectedHostelId])

  const totalBeds = (summary?.bedsAvailable ?? 0) + (summary?.bedsOccupied ?? 0)
  const occupancyRate = totalBeds > 0 ? Math.round(((summary?.bedsOccupied ?? 0) / totalBeds) * 100) : 0

  return (
    <>
      <RoleHeroHeader
        userId="" role="hostel"
        roleLabel={ROLE_LABEL[appointmentType] ?? 'Hostel Staff'}
        profile={null} school={school}
        greeting="Hostel overview"
        headline={hostels.length > 0 ? hostels.map(h => h.name).join(', ') : 'No hostels set up yet'}
        sub="Occupancy, roll call, and room management"
        featureGroups={FEATURE_GROUPS}
      />

      <ContextSwitcher />

      <main className={styles.main}>
        {hostels.length > 1 && (
          <div className={styles.hostelSwitch}>
            {hostels.map(h => (
              <button
                key={h.id}
                className={`${styles.hostelChip} ${h.id === selectedHostelId ? styles.hostelChipActive : ''} ${motion.pressable}`}
                onClick={() => setSelectedHostelId(h.id)}
              >
                {h.name}
              </button>
            ))}
          </div>
        )}

        {status === 'error' && (
          <div className={`glass-card ${styles.errorCard}`}>
            <AlertCircleIcon size={20} />
            <div>
              <p>Couldn't load hostel data. Check your connection and try again.</p>
              <button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
            </div>
          </div>
        )}

        {hostels.length === 0 && status === 'ready' && (
          <div className={`glass-card ${styles.emptyCard}`}>
            <HomeIcon size={24} />
            <p>No hostels have been set up for this school yet. Ask your principal or secretary to add one before rooms and roll call can be used.</p>
          </div>
        )}

        {hostels.length > 0 && (
          <>
            <div className="glass-card" style={{ padding: 20, marginBottom: 16 }}>
              <GaugeStat
                label="Bed occupancy"
                value={status === 'ready' ? occupancyRate : 0}
                isPercent
                caption={status === 'ready' ? `${summary?.bedsOccupied ?? 0} of ${totalBeds} beds` : undefined}
                color="var(--brand-2, var(--brand))"
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <AiInsightBanner
                insight={buildInsight(status === 'ready' ? summary : null, occupancyRate)}
                actionLabel="Open roll call →"
                actionHref="/dashboard/hostel/roll-call"
              />
            </div>

            <div className={styles.statGrid}>
              <StatTile icon={<UsersIcon size={18} />} label="Boarding students"
                value={summary?.boardingStudentCount} loading={status === 'loading'} />
              <StatTile icon={<CheckCircleIcon size={18} />} label="Accounted for (latest roll call)"
                value={summary?.accountedFor} loading={status === 'loading'} />
              <StatTile icon={<LayersIcon size={18} />} label="Vacant rooms"
                value={summary?.vacantRooms} loading={status === 'loading'} />
              <StatTile icon={<AlertCircleIcon size={18} />} label="Absent (latest roll call)"
                value={summary?.absent} loading={status === 'loading'} tone={summary?.absent ? 'warning' : undefined} />
              <StatTile icon={<ClockIcon size={18} />} label="On approved leave"
                value={summary?.onLeave} loading={status === 'loading'} />
              <StatTile icon={<ClockIcon size={18} />} label="Late returns"
                value={summary?.lateReturns} loading={status === 'loading'} tone={summary?.lateReturns ? 'warning' : undefined} />
              <Link href="/dashboard/hostel/incidents" className={styles.statLink}>
                <StatTile icon={<AlertIcon size={18} />} label="Open incidents"
                  value={summary?.openIncidents} loading={status === 'loading'} tone={summary?.openIncidents ? 'warning' : undefined} />
              </Link>
              <Link href="/dashboard/hostel/maintenance" className={styles.statLink}>
                <StatTile icon={<AlertCircleIcon size={18} />} label="Open maintenance requests"
                  value={summary?.openMaintenance} loading={status === 'loading'} />
              </Link>
            </div>
          </>
        )}
      </main>

      <BottomDock aiHref="/dashboard/hostel/ai" groups={FEATURE_GROUPS} role="hostel" />
    </>
  )
}

function StatTile({ icon, label, value, loading, tone }: {
  icon: React.ReactNode; label: string; value?: number; loading: boolean
  tone?: 'warning'
}) {
  return (
    <div className={`glass-card ${styles.statTile}`}>
      <div className={styles.statIcon}>{icon}</div>
      <div>
        <div className={`${styles.statValue} ${tone === 'warning' && (value ?? 0) > 0 ? styles.statValueWarning : ''}`}>
          {loading ? <span className={motion.shimmer}>00</span> : (value ?? 0)}
        </div>
        <div className={styles.statLabel}>{label}</div>
      </div>
    </div>
  )
}
