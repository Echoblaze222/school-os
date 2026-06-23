'use client'
// src/app/dashboard/principal/transfers/pending/PendingTransfersClient.tsx
// Rebuilt with RolePageWrapper + secretary.module.css to match the rest of the principal dashboard.

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '@/app/dashboard/secretary/secretary.module.css'
import type { PendingTransferRow } from '../../types'

interface Props {
  transfers: PendingTransferRow[]
  principalId: string
  profile: any
  school: any
  userId: string
}

function relTime(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  return days === 0 ? 'Today' : `${days}d ago`
}

function initials(n: string) {
  return n.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

export default function PendingTransfersClient({
  transfers: initial, principalId, profile, school, userId,
}: Props) {
  const [transfers, setTransfers] = useState<PendingTransferRow[]>(initial)
  const [loading,     setLoading]     = useState<Set<string>>(new Set())
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({})
  const [toast, setToast] = useState<string | null>(null)

  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  function showToast(m: string) {
    setToast(m)
    setTimeout(() => setToast(null), 3000)
  }

  async function approve(t: PendingTransferRow) {
    setLoading(p => new Set(p).add(t.id))
    const now = new Date().toISOString()

    await supabase.from('student_transfers')
      .update({ status: 'approved', approved_at: now, approved_by: principalId })
      .eq('id', t.id)

    let error = null
    try {
      const res = await supabase.rpc('complete_transfer', { transfer_id: t.id })
      error = res.error
    } catch { error = null }

    if (error) {
      await supabase.from('student_transfers').update({ status: 'completed' }).eq('id', t.id)
    }

    await supabase.from('notifications').insert({
      user_id: t.student_id, title: 'Transfer Approved',
      body: 'Your school transfer has been approved!',
      type: 'transfer', read: false, created_at: now,
    })

    setTransfers(p => p.filter(x => x.id !== t.id))
    setLoading(p => { const n = new Set(p); n.delete(t.id); return n })
    showToast(`Transfer for ${t.student_name} approved`)
  }

  async function reject(t: PendingTransferRow) {
    const reason = rejectReason[t.id] ?? ''
    setLoading(p => new Set(p).add(t.id))
    const now = new Date().toISOString()

    await supabase.from('student_transfers').update({
      status: 'rejected', rejection_reason: reason || null,
      rejected_at: now, rejected_by: principalId,
    }).eq('id', t.id)

    await supabase.from('notifications').insert({
      user_id: t.student_id, title: 'Transfer Rejected',
      body: `Your transfer was rejected.${reason ? ` Reason: ${reason}` : ''}`,
      type: 'transfer', read: false, created_at: now,
    })

    setTransfers(p => p.filter(x => x.id !== t.id))
    setLoading(p => { const n = new Set(p); n.delete(t.id); return n })
    setRejectingId(null)
    showToast(`Transfer for ${t.student_name} rejected`)
  }

  return (
    <RolePageWrapper
      userId={userId}
      role="principal"
      profile={profile}
      school={school}
      title="Pending Transfers"
      showBack
    >
      {transfers.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyEmoji}>✈️</p>
          <p className={styles.emptyTitle}>No pending requests</p>
          <p className={styles.emptyHint}>Transfer requests from other schools will appear here for your review.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          {transfers.map(t => {
            const busy = loading.has(t.id)
            return (
              <div key={t.id} style={{
                background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-xl)', overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', padding: 'var(--space-4)' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                    background: sc + '25', color: sc,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.95rem',
                  }}>
                    {initials(t.student_name)}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--text-primary)', margin: 0 }}>
                      {t.student_name}
                    </p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>
                      From: {t.origin_school_name ?? 'Unknown'} · {relTime(t.initiated_at)}
                    </p>
                    {t.notes && (
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: '3px 0 0' }}>
                        {t.notes}
                      </p>
                    )}
                  </div>
                  <span style={{
                    fontSize: '0.65rem', fontWeight: 700, padding: '3px 10px',
                    borderRadius: 'var(--radius-full)', flexShrink: 0,
                    background: 'rgba(245,158,11,0.15)', color: '#F59E0B',
                  }}>
                    Pending
                  </span>
                </div>

                {/* Stats strip */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3,1fr)',
                  borderTop: '1px solid var(--glass-border)',
                  borderBottom: '1px solid var(--glass-border)',
                }}>
                  {([
                    ['Avg Score',        t.avg_score !== null ? `${t.avg_score}%` : '—', false],
                    ['Results',          t.total_results,                                 false],
                    ['Outstanding Fees', t.outstanding_fees > 0
                      ? `₦${t.outstanding_fees.toLocaleString()}` : 'None',               t.outstanding_fees > 0],
                  ] as [string, any, boolean][]).map(([lbl, val, isRed]) => (
                    <div key={lbl} style={{
                      padding: 'var(--space-3) var(--space-4)',
                      display: 'flex', flexDirection: 'column', gap: 3,
                      borderRight: lbl !== 'Outstanding Fees' ? '1px solid var(--glass-border)' : undefined,
                    }}>
                      <span style={{ fontSize: '1.1rem', fontWeight: 800, lineHeight: 1, color: isRed ? '#EF4444' : 'var(--text-primary)' }}>
                        {val}
                      </span>
                      <span style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                        {lbl}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                  <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <button
                      className={styles.btnPrimary}
                      style={{ flex: 1, background: '#10B981', borderColor: '#10B981' }}
                      onClick={() => approve(t)}
                      disabled={busy}>
                      {busy ? 'Processing…' : 'Approve Transfer'}
                    </button>
                    <button
                      className={styles.btnGhost}
                      style={{ color: '#EF4444', borderColor: '#EF444440' }}
                      onClick={() => setRejectingId(rejectingId === t.id ? null : t.id)}
                      disabled={busy}>
                      Reject
                    </button>
                  </div>

                  {rejectingId === t.id && (
                    <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                      <input
                        className={styles.formInput}
                        style={{ flex: 1 }}
                        placeholder="Reason (optional)…"
                        value={rejectReason[t.id] ?? ''}
                        onChange={e => setRejectReason(p => ({ ...p, [t.id]: e.target.value }))}
                      />
                      <button
                        className={styles.btnPrimary}
                        style={{ background: '#EF4444', borderColor: '#EF4444', whiteSpace: 'nowrap' }}
                        onClick={() => reject(t)}
                        disabled={busy}>
                        Confirm
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 100, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
          backdropFilter: 'blur(16px)', borderRadius: 'var(--radius-full)',
          padding: '10px 20px', fontSize: '0.82rem', fontWeight: 600,
          color: 'var(--text-primary)', zIndex: 9999, whiteSpace: 'nowrap',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}>
          {toast}
        </div>
      )}

      <div style={{ height: 80 }} />
    </RolePageWrapper>
  )
      }
  
