'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import GaugeStat from '@/components/GaugeStat'
import { SkeletonList } from '@/components/motion/Skeleton'
import { Toast, useToast } from '@/components/motion/Toast'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string }

const CATEGORY_LABEL: Record<string, string> = {
  academic_risk: 'Academic risk',
  attendance: 'Attendance',
  behavioral: 'Behavioral',
  emotional: 'Emotional',
  family: 'Family',
  peer: 'Peer',
  other: 'Other',
  general: 'General',
}

export default function ReportsClient({ profile, school, userId }: Props) {
  const [report, setReport] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const { toast, showToast } = useToast()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/counselor/reports')
        const json = await res.json()
        if (cancelled) return
        if (!res.ok) { showToast(json.error ?? 'Could not load your report.'); return }
        setReport(json)
      } catch {
        if (!cancelled) showToast('Network error. Please check your connection and try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <RolePageWrapper userId={userId} role="counselor" profile={profile} school={school} title="Reports">
      <Toast toast={toast} />

      {loading || !report ? (
        <SkeletonList count={3} variant="card" />
      ) : (
        <>
          <div className={motion.riseIn} style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(104px, 1fr))', gap: 12, marginBottom: 20,
          }}>
            <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
              <GaugeStat label="Open cases" value={report.openCases} color="var(--brand)" caption="active" />
            </div>
            <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
              <GaugeStat label="Monitoring" value={report.monitoringCases} color="var(--brand-2, var(--brand))" caption="watching" delayMs={80} />
            </div>
            <div className={`glass-card ${motion.pressable}`} style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
              <GaugeStat label="Follow-ups done" value={report.followUpCompletionRate ?? 0} isPercent
                color="var(--status-ok, #10B981)" caption="completion rate" delayMs={160} />
            </div>
          </div>

          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 10px' }}>
            Caseload summary
          </p>
          <div className="glass-card" style={{ padding: 16, borderRadius: 'var(--radius-lg)', marginBottom: 20, display: 'grid', gap: 10 }}>
            <Row label="Total cases handled" value={report.totalCases} />
            <Row label="Closed cases" value={report.closedCases} />
            <Row label="Average days to close" value={report.averageDaysToClose ?? 'N/A'} />
            <Row label="Appointments completed" value={report.completedSessions} />
            <Row label="No-shows" value={report.noShowSessions} />
          </div>

          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 10px' }}>
            Cases by category
          </p>
          <div className="glass-card" style={{ padding: 16, borderRadius: 'var(--radius-lg)', marginBottom: 20, display: 'grid', gap: 10 }}>
            {Object.entries(report.casesByCategory as Record<string, number>).length === 0 ? (
              <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No cases yet.</p>
            ) : (
              Object.entries(report.casesByCategory as Record<string, number>).map(([cat, count]) => (
                <Row key={cat} label={CATEGORY_LABEL[cat] ?? cat} value={count as number} />
              ))
            )}
          </div>

          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', margin: '0 0 10px' }}>
            Referrals
          </p>
          <div className="glass-card" style={{ padding: 16, borderRadius: 'var(--radius-lg)', marginBottom: 40, display: 'grid', gap: 10 }}>
            <Row label="Total received" value={report.referrals.total} />
            <Row label="Pending review" value={report.referrals.pending} />
            <Row label="Converted to cases" value={report.referrals.converted} />
          </div>
        </>
      )}
    </RolePageWrapper>
  )
}

function Row({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontWeight: 700 }}>{value}</span>
    </div>
  )
}
