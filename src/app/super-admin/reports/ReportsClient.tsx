'use client'
// src/app/super-admin/reports/ReportsClient.tsx
// Phase 4, Lane G (§52, §62) review queue UI for public.content_reports.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, AlertCircleIcon, CheckCircleIcon, ClockIcon } from '@/components/Icons'

interface Report {
  id: string
  target_type: string
  target_id: string
  reason: string
  details: string | null
  reporter_contact: string | null
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed'
  resolution_note: string | null
  created_at: string
}

const TARGET_LABEL: Record<string, string> = {
  school: 'School', admission_application: 'Admission Application',
  school_promotion: 'Promotion', content_post: 'Blog Post',
}
const REASON_LABEL: Record<string, string> = {
  fake_school: 'Fake school', impersonation: 'Impersonation',
  fake_admission_offer: 'Fake admission offer', fraudulent_payment_request: 'Fraudulent payment request',
  spam: 'Spam', misleading_claims: 'Misleading claims', inappropriate_content: 'Inappropriate content',
  copyright_violation: 'Copyright violation', fake_achievement: 'Fake achievement', other: 'Other',
}
const STATUS_COLOR: Record<string, string> = {
  open: '#EF4444', reviewing: '#F59E0B', actioned: '#10B981', dismissed: 'var(--text-muted)',
}

export default function ReportsClient() {
  const [reports, setReports] = useState<Report[]>([])
  const [filter, setFilter] = useState<'active' | 'actioned' | 'dismissed'>('active')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const statusParam = filter === 'active' ? '' : `?status=${filter}`
    const res = await fetch(`/api/super-admin/reports${statusParam}`)
    const json = await res.json()
    setReports(json.ok ? json.reports : [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  async function resolve(reportId: string, status: 'reviewing' | 'actioned' | 'dismissed') {
    setBusyId(reportId)
    await fetch('/api/super-admin/reports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ report_id: reportId, status, resolution_note: notes[reportId] || undefined }),
    })
    setBusyId(null)
    load()
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 'var(--space-5)' }}>
      <Link href="/super-admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none', marginBottom: 'var(--space-4)' }}>
        <ArrowLeftIcon size={14} /> Back
      </Link>

      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 var(--space-1)' }}>
        Content Reports
      </h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 var(--space-4)' }}>
        Public reports of fake schools, impersonation, fraudulent offers, spam, and other issues (§52, §62).
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)' }}>
        {(['active', 'actioned', 'dismissed'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              background: filter === f ? 'var(--brand)' : 'var(--glass-bg)',
              color: filter === f ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${filter === f ? 'var(--brand)' : 'var(--glass-border)'}`,
            }}>
            {f === 'active' ? 'Open / Reviewing' : f[0].toUpperCase() + f.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</p>
      ) : reports.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <CheckCircleIcon size={36} color="var(--text-faint)" />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>Nothing here right now.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {reports.map(r => (
            <div key={r.id} style={{ padding: 'var(--space-4)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 700, color: STATUS_COLOR[r.status], textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                    {r.status}
                  </span>
                  <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 0' }}>
                    {REASON_LABEL[r.reason] ?? r.reason} - {TARGET_LABEL[r.target_type] ?? r.target_type}
                  </p>
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', margin: '2px 0 0', fontFamily: 'monospace' }}>
                    {r.target_type}:{r.target_id}
                  </p>
                </div>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ClockIcon size={11} /> {new Date(r.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                </span>
              </div>

              {r.details && (
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '8px 0' }}>{r.details}</p>
              )}
              {r.reporter_contact && (
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '4px 0' }}>Reporter contact: {r.reporter_contact}</p>
              )}
              {r.resolution_note && (
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '8px 0', fontStyle: 'italic' }}>Resolution: {r.resolution_note}</p>
              )}

              {(r.status === 'open' || r.status === 'reviewing') && (
                <>
                  <textarea
                    value={notes[r.id] ?? ''}
                    onChange={e => setNotes(n => ({ ...n, [r.id]: e.target.value }))}
                    placeholder="Resolution note (optional)"
                    style={{ width: '100%', height: 44, marginTop: 8, padding: 8, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none', resize: 'vertical' }}
                  />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    {r.status === 'open' && (
                      <button onClick={() => resolve(r.id, 'reviewing')} disabled={busyId === r.id}
                        style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}>
                        Mark Reviewing
                      </button>
                    )}
                    <button onClick={() => resolve(r.id, 'actioned')} disabled={busyId === r.id}
                      style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.25)', color: '#10B981' }}>
                      Actioned
                    </button>
                    <button onClick={() => resolve(r.id, 'dismissed')} disabled={busyId === r.id}
                      style={{ padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-muted)' }}>
                      Dismiss
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
