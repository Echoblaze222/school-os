'use client'
// src/app/super-admin/promotions/PromotionsModerationClient.tsx
// Consumes the moderation-queue API and the approve/reject action that
// already existed with no page to call them from.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  ArrowLeftIcon, StarIcon, CheckCircleIcon, XIcon,
  SchoolIcon, CalendarIcon, ImageIcon, LinkIcon,
} from '@/components/Icons'

interface PromotionRow {
  id: string
  promotion_type: string
  title: string
  summary: string | null
  image_url: string | null
  external_link: string | null
  is_sponsored: boolean
  created_at: string
  schools: { name: string; city: string | null; state: string | null } | null
}

const TYPE_LABEL: Record<string, string> = {
  admission_push: 'Admission Push', open_day: 'Open Day', scholarship: 'Scholarship',
  event: 'Event', academic_program: 'Academic Program', achievement: 'Achievement',
  announcement: 'Announcement', campaign: 'Campaign', article: 'Article',
  facility: 'Facility', boarding: 'Boarding', deadline_reminder: 'Deadline Reminder',
}

export default function PromotionsModerationClient() {
  const [queue,   setQueue]   = useState<PromotionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [decidingId, setDecidingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/super-admin/promotions')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Couldn\'t load the moderation queue.')
      setQueue(json.promotions ?? [])
    } catch (err: any) {
      setLoadError(err?.message ?? 'Couldn\'t load the moderation queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function decide(id: string, decision: 'approve' | 'reject', reason?: string) {
    setActionError(null)
    setDecidingId(id)
    try {
      const res = await fetch(`/api/super-admin/promotions/${id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, reason }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? 'Couldn\'t save this decision.')
      // Pulled straight from a live queue - once decided, it's no longer
      // pending_review, so drop it locally rather than refetch the whole list.
      setQueue(prev => prev.filter(p => p.id !== id))
      setRejectingId(null)
      setRejectReason('')
    } catch (err: any) {
      setActionError(err?.message ?? 'Couldn\'t save this decision.')
    } finally {
      setDecidingId(null)
    }
  }

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'var(--space-5)' }}>
      <Link href="/super-admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none', marginBottom: 'var(--space-4)' }}>
        <ArrowLeftIcon size={14} /> Back
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <StarIcon size={20} /> Promotions
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>
            Sponsored content and scholarships awaiting review before going live on the public site.
          </p>
        </div>
        {!loading && queue.length > 0 && (
          <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#F59E0B', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 999, padding: '5px 12px' }}>
            {queue.length} pending
          </span>
        )}
      </div>

      {actionError && (
        <p style={{ color: 'var(--danger)', fontSize: '0.82rem', marginBottom: 'var(--space-3)' }}>{actionError}</p>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</p>
      ) : loadError ? (
        <p style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>{loadError}</p>
      ) : queue.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <CheckCircleIcon size={36} color="var(--text-faint)" />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>
            Nothing waiting on review. New submissions will show up here.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {queue.map(p => (
            <div key={p.id} style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 14, overflow: 'hidden' }}>
              {p.image_url ? (
                <img src={p.image_url} alt="" style={{ width: '100%', maxHeight: 200, objectFit: 'cover', display: 'block' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', color: 'var(--text-faint)', fontSize: '0.75rem', borderBottom: '1px solid var(--glass-border)' }}>
                  <ImageIcon size={14} /> No image attached
                </div>
              )}

              <div style={{ padding: '14px 18px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--brand)', background: 'var(--brand-subtle, rgba(128,0,32,0.08))', borderRadius: 999, padding: '2px 10px' }}>
                    {TYPE_LABEL[p.promotion_type] ?? p.promotion_type}
                  </span>
                  {p.is_sponsored && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#F59E0B' }}>Sponsored</span>
                  )}
                </div>

                <p style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{p.title}</p>
                {p.summary && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', margin: '0 0 10px' }}>{p.summary}</p>}

                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <SchoolIcon size={13} /> {p.schools?.name ?? 'Unknown school'}
                    {p.schools?.city && ` · ${p.schools.city}${p.schools.state ? `, ${p.schools.state}` : ''}`}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <CalendarIcon size={13} /> Submitted {new Date(p.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  {p.external_link && (
                    <a href={p.external_link} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--brand)', textDecoration: 'none' }}>
                      <LinkIcon size={13} /> Linked page
                    </a>
                  )}
                </div>

                {rejectingId === p.id ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <textarea
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Reason this is being rejected - the school will see this"
                      rows={2}
                      style={{ background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text-primary)', fontSize: '0.82rem', resize: 'vertical' }}
                    />
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={() => decide(p.id, 'reject', rejectReason)}
                        disabled={!rejectReason.trim() || decidingId === p.id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'var(--danger)', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: (!rejectReason.trim() || decidingId === p.id) ? 0.6 : 1 }}
                      >
                        {decidingId === p.id ? 'Rejecting...' : <><XIcon size={13} /> Confirm Reject</>}
                      </button>
                      <button
                        onClick={() => { setRejectingId(null); setRejectReason('') }}
                        style={{ padding: '7px 16px', background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', borderRadius: 8, fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => decide(p.id, 'approve')}
                      disabled={decidingId === p.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: '#10B981', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: decidingId === p.id ? 0.6 : 1 }}
                    >
                      {decidingId === p.id ? 'Approving...' : <><CheckCircleIcon size={13} /> Approve</>}
                    </button>
                    <button
                      onClick={() => { setRejectingId(p.id); setRejectReason('') }}
                      disabled={decidingId === p.id}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', borderRadius: 8, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}
                    >
                      <XIcon size={13} /> Reject
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
