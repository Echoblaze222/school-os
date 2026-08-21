'use client'
// src/components/ReportContentButton.tsx
// Phase 4, Lane G (§52, §62) - reusable "Report" trigger for any public
// target (school, promotion, blog post). Posts to /api/public/reports,
// which requires no authentication - see that route for why.

import { useState } from 'react'
import { AlertCircleIcon } from '@/components/Icons'

type TargetType = 'school' | 'admission_application' | 'school_promotion' | 'content_post'

const REASONS: { value: string; label: string }[] = [
  { value: 'fake_school',                label: 'This looks like a fake school' },
  { value: 'impersonation',               label: 'Someone is impersonating a school or staff member' },
  { value: 'fake_admission_offer',        label: 'This is a fake admission offer' },
  { value: 'fraudulent_payment_request',  label: 'This is asking for a suspicious payment' },
  { value: 'misleading_claims',           label: 'This makes misleading claims' },
  { value: 'inappropriate_content',       label: 'Inappropriate content' },
  { value: 'spam',                        label: 'Spam' },
  { value: 'copyright_violation',         label: 'Copyright violation' },
  { value: 'fake_achievement',            label: 'Fake ranking or achievement' },
  { value: 'other',                       label: 'Something else' },
]

export default function ReportContentButton({ targetType, targetId }: { targetType: TargetType; targetId: string }) {
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function submit() {
    if (!reason) { setError('Please choose a reason.'); return }
    setSubmitting(true); setError('')
    const res = await fetch('/api/public/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_type: targetType, target_id: targetId, reason, details: details || undefined }),
    })
    const json = await res.json().catch(() => ({}))
    setSubmitting(false)
    if (res.ok) {
      setDone(true)
    } else {
      setError(json.error || "Couldn't submit your report. Please try again.")
    }
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(true) }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 999, color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer' }}
      >
        <AlertCircleIcon size={12} /> Report
      </button>

      {open && (
        <div
          role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}
          onClick={() => setOpen(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--glass-border)', borderRadius: 16, padding: 'var(--space-5)' }}
          >
            {done ? (
              <>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 8px' }}>Thanks - report received</p>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 16px' }}>Our team will review this.</p>
                <button onClick={() => { setOpen(false); setDone(false); setReason(''); setDetails('') }}
                  style={{ width: '100%', height: 38, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                  Close
                </button>
              </>
            ) : (
              <>
                <p style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 12px' }}>Report this</p>
                <select value={reason} onChange={e => setReason(e.target.value)}
                  style={{ width: '100%', height: 38, padding: '0 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', marginBottom: 10 }}>
                  <option value="">Choose a reason...</option>
                  {REASONS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <textarea value={details} onChange={e => setDetails(e.target.value)}
                  placeholder="Add any details that would help our team (optional)"
                  style={{ width: '100%', height: 70, padding: 8, background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.8rem', outline: 'none', resize: 'vertical', marginBottom: 10 }}
                />
                {error && <p style={{ color: 'var(--danger)', fontSize: '0.78rem', margin: '0 0 10px' }}>{error}</p>}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => setOpen(false)}
                    style={{ flex: 1, height: 38, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={submit} disabled={submitting}
                    style={{ flex: 1, height: 38, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                    {submitting ? 'Sending...' : 'Submit Report'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
