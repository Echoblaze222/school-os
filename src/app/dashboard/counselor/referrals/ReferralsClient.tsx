'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ShieldIcon, XIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string }

const TABS = ['pending', 'converted_to_case', 'declined'] as const
type Tab = typeof TABS[number]

const TAB_LABEL: Record<Tab, string> = {
  pending: 'Pending',
  converted_to_case: 'Accepted',
  declined: 'Declined',
}

const URGENCY_COLOR: Record<string, string> = {
  normal: 'var(--text-muted)',
  elevated: 'var(--status-warn, #E4572E)',
  urgent: '#EF4444',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function ReferralsClient({ profile, school, userId }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('pending')
  const [referrals, setReferrals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [decliningId, setDecliningId] = useState<string | null>(null)
  const [declineReason, setDeclineReason] = useState('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const { toast, showToast } = useToast()

  async function load(status: Tab) {
    setLoading(true)
    try {
      const res = await fetch(`/api/counselor/referrals?status=${status}`)
      const json = await res.json()
      setReferrals(res.ok ? (json.referrals ?? []) : [])
      if (!res.ok) showToast(json.error ?? 'Could not load referrals.')
    } catch {
      showToast('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(tab) }, [tab])

  async function accept(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/counselor/referrals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'convert_to_case' }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(json.error ?? 'Could not accept the referral.'); setBusyId(null); return }
      showToast('Referral accepted. Case opened.')
      if (json.caseId) router.push(`/dashboard/counselor/cases/${json.caseId}`)
      else load(tab)
    } catch {
      showToast('Network error. Please try again.')
      setBusyId(null)
    }
  }

  async function decline(id: string) {
    setBusyId(id)
    try {
      const res = await fetch(`/api/counselor/referrals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'decline', declineReason }),
      })
      const json = await res.json()
      if (!res.ok) { showToast(json.error ?? 'Could not decline the referral.'); setBusyId(null); return }
      setDecliningId(null); setDeclineReason('')
      showToast('Referral declined.')
      load(tab)
    } catch {
      showToast('Network error. Please try again.')
      setBusyId(null)
    }
  }

  return (
    <RolePageWrapper userId={userId} role="counselor" profile={profile} school={school} title="Referrals">
      <Toast toast={toast} />

      <div className={motion.riseIn} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`${motion.pressable} ${motion.focusable}`}
            style={{
              flex: 1, height: 36, borderRadius: 9, fontSize: '0.76rem', fontWeight: 700,
              cursor: 'pointer',
              border: tab === t ? 'none' : '1px solid var(--glass-border)',
              background: tab === t ? 'var(--brand)' : 'var(--glass-bg)',
              color: tab === t ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {loading ? (
        <SkeletonList count={3} variant="card" />
      ) : referrals.length === 0 ? (
        <EmptyState
          icon={<ShieldIcon size={32} color="var(--text-muted)" />}
          title={`No ${TAB_LABEL[tab].toLowerCase()} referrals`}
          subtitle={tab === 'pending' ? 'Referrals from teachers, parents, or staff will appear here for your review.' : undefined}
        />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {referrals.map((r: any, i: number) => (
            <div key={r.id} className={`glass-card ${motion.riseIn}`} style={{ padding: 16, borderRadius: 'var(--radius-lg)', animationDelay: `${i * 40}ms` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>{r.student?.full_name ?? 'Student'}</p>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>
                    Referred by {r.referrer?.full_name ?? 'staff'} · {formatDate(r.created_at)}
                  </p>
                </div>
                {r.urgency !== 'normal' && (
                  <span style={{
                    fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                    color: URGENCY_COLOR[r.urgency], background: `${URGENCY_COLOR[r.urgency]}18`,
                    textTransform: 'capitalize',
                  }}>
                    {r.urgency}
                  </span>
                )}
              </div>

              <p style={{ fontSize: '0.84rem', margin: '10px 0 0', whiteSpace: 'pre-wrap' }}>{r.reason}</p>

              {tab === 'pending' && (
                decliningId === r.id ? (
                  <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                    <input
                      value={declineReason}
                      onChange={e => setDeclineReason(e.target.value)}
                      placeholder="Reason for declining (optional)"
                      style={{ height: 36, borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '0 10px', fontSize: '0.8rem' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <ActionButton onClick={() => { setDecliningId(null); setDeclineReason('') }} variant="ghost" fullWidth>Cancel</ActionButton>
                      <ActionButton onClick={() => decline(r.id)} loading={busyId === r.id} loadingLabel="Declining…" variant="danger" fullWidth>Confirm decline</ActionButton>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <ActionButton onClick={() => setDecliningId(r.id)} variant="ghost" fullWidth>Decline</ActionButton>
                    <ActionButton onClick={() => accept(r.id)} loading={busyId === r.id} loadingLabel="Accepting…" fullWidth>Accept</ActionButton>
                  </div>
                )
              )}
            </div>
          ))}
        </div>
      )}
    </RolePageWrapper>
  )
}
