'use client'

import { useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import type { PromotionRow } from './page'
import styles from './promotions.module.css'

interface Props {
  promotions: PromotionRow[]
  userId: string
  profile: any
  school: any
}

const TYPE_LABELS: Record<string, string> = {
  admission: 'Admission', open_day: 'Open Day', scholarship: 'Scholarship',
  event: 'Event', academic_program: 'Academic Program', achievement: 'Achievement',
  announcement: 'Announcement', campaign: 'Campaign', article: 'Article',
  facility: 'Facility', boarding: 'Boarding', application_deadline: 'Application Deadline',
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Draft', pending_review: 'Pending review', approved: 'Approved',
  rejected: 'Rejected', live: 'Live', paused: 'Paused', expired: 'Expired',
}

function statusClass(status: string, s: typeof styles) {
  switch (status) {
    case 'live': return s.statusLive
    case 'pending_review': return s.statusPending
    case 'rejected': return s.statusRejected
    case 'paused': return s.statusPaused
    default: return s.statusDraft
  }
}

const EMPTY_FORM = {
  promotion_type: 'announcement',
  title: '',
  summary: '',
  body: '',
  external_link: '',
  start_date: '',
  end_date: '',
  is_sponsored: false,
}

export default function PromotionsClient({ promotions, userId, profile, school }: Props) {
  const [rows, setRows] = useState<PromotionRow[]>(promotions)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [analyticsFor, setAnalyticsFor] = useState<string | null>(null)
  const [analytics, setAnalytics] = useState<{ totals: Record<string, number> } | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  async function createPromotion(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    if (!form.title.trim() || !form.summary.trim() || !form.start_date || !form.end_date) {
      setFormError('Please fill in the title, summary, and both dates.')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/schools/promotions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        setFormError(data.error || 'Something went wrong. Please try again.')
        return
      }
      setRows((prev) => [data.promotion, ...prev])
      setForm(EMPTY_FORM)
      setShowForm(false)
    } catch {
      setFormError('Couldn\'t reach the server. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  async function runAction(id: string, action: 'submit' | 'pause' | 'resume', method: 'PATCH' = 'PATCH') {
    setBusyId(id)
    try {
      const res = await fetch(`/api/schools/promotions/${id}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'That action failed. Please try again.')
        return
      }
      setRows((prev) => prev.map((p) => (p.id === id ? data.promotion : p)))
    } catch {
      alert('Couldn\'t reach the server. Check your connection and try again.')
    } finally {
      setBusyId(null)
    }
  }

  async function deletePromotion(id: string) {
    if (!confirm('Delete this promotion? This can\'t be undone.')) return
    setBusyId(id)
    try {
      const res = await fetch(`/api/schools/promotions/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) {
        alert(data.error || 'Couldn\'t delete this promotion.')
        return
      }
      setRows((prev) => prev.filter((p) => p.id !== id))
    } finally {
      setBusyId(null)
    }
  }

  async function viewAnalytics(id: string) {
    if (analyticsFor === id) {
      setAnalyticsFor(null)
      setAnalytics(null)
      return
    }
    setAnalyticsFor(id)
    setAnalyticsLoading(true)
    setAnalytics(null)
    try {
      const res = await fetch(`/api/schools/promotions/${id}/analytics`)
      const data = await res.json()
      if (res.ok) setAnalytics(data)
    } finally {
      setAnalyticsLoading(false)
    }
  }

  return (
    <RolePageWrapper userId={userId} role={profile.role} profile={profile} school={school} title="Promotions">
      <div className={styles.container}>
        <div className={styles.intro}>
          <p>
            Share admissions, open days, scholarships, and other approved content on the public
            SchoolOS platform. Sponsored content and scholarships go through a short review before
            they go live; everything else publishes as soon as you submit it.
          </p>
        </div>

        {!showForm && (
          <button className={styles.newButton} onClick={() => setShowForm(true)}>
            + New Promotion
          </button>
        )}

        {showForm && (
          <form className={styles.form} onSubmit={createPromotion}>
            <div className={styles.formRow}>
              <label>
                Type
                <select
                  value={form.promotion_type}
                  onChange={(e) => setForm({ ...form, promotion_type: e.target.value })}
                >
                  {Object.entries(TYPE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>
              <label className={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={form.is_sponsored}
                  onChange={(e) => setForm({ ...form, is_sponsored: e.target.checked })}
                />
                Sponsored placement
              </label>
            </div>

            <label>
              Title
              <input
                type="text"
                maxLength={120}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. 2027 Admissions Now Open"
              />
            </label>

            <label>
              Summary
              <textarea
                maxLength={400}
                rows={2}
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
                placeholder="One or two sentences shown in the discovery feed."
              />
            </label>

            <label>
              Full details (optional)
              <textarea
                rows={4}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
              />
            </label>

            <label>
              Link (optional)
              <input
                type="url"
                value={form.external_link}
                onChange={(e) => setForm({ ...form, external_link: e.target.value })}
                placeholder="https://"
              />
            </label>

            <div className={styles.formRow}>
              <label>
                Start date
                <input
                  type="date"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </label>
              <label>
                End date
                <input
                  type="date"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </label>
            </div>

            {formError && <p className={styles.errorText}>{formError}</p>}

            <div className={styles.formActions}>
              <button type="button" className={styles.cancelButton} onClick={() => { setShowForm(false); setFormError(null) }}>
                Cancel
              </button>
              <button type="submit" className={styles.saveButton} disabled={saving}>
                {saving ? 'Saving…' : 'Save as draft'}
              </button>
            </div>
          </form>
        )}

        <div className={styles.list}>
          {rows.length === 0 && !showForm && (
            <p className={styles.emptyState}>
              No promotions yet. Create one to reach families browsing SchoolOS.
            </p>
          )}

          {rows.map((p) => (
            <div key={p.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <span className={`${styles.statusBadge} ${statusClass(p.status, styles)}`}>
                  {STATUS_LABELS[p.status] ?? p.status}
                </span>
                {p.is_sponsored && <span className={styles.sponsoredBadge}>Sponsored</span>}
                <span className={styles.typeLabel}>{TYPE_LABELS[p.promotion_type] ?? p.promotion_type}</span>
              </div>

              <h3 className={styles.cardTitle}>{p.title}</h3>
              <p className={styles.cardSummary}>{p.summary}</p>
              <p className={styles.cardDates}>{p.start_date} to {p.end_date}</p>

              {p.status === 'rejected' && p.rejection_reason && (
                <p className={styles.rejectionReason}>Not approved: {p.rejection_reason}</p>
              )}

              <div className={styles.cardActions}>
                {(p.status === 'draft' || p.status === 'rejected') && (
                  <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'submit')}>
                    {p.requires_moderation ? 'Submit for review' : 'Publish'}
                  </button>
                )}
                {p.status === 'live' && (
                  <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'pause')}>Pause</button>
                )}
                {p.status === 'paused' && (
                  <button disabled={busyId === p.id} onClick={() => runAction(p.id, 'resume')}>Resume</button>
                )}
                {(p.status === 'live' || p.status === 'paused') && (
                  <button disabled={busyId === p.id} onClick={() => viewAnalytics(p.id)}>
                    {analyticsFor === p.id ? 'Hide analytics' : 'View analytics'}
                  </button>
                )}
                {(p.status === 'draft' || p.status === 'rejected' || p.status === 'expired') && (
                  <button
                    className={styles.deleteButton}
                    disabled={busyId === p.id}
                    onClick={() => deletePromotion(p.id)}
                  >
                    Delete
                  </button>
                )}
              </div>

              {analyticsFor === p.id && (
                <div className={styles.analyticsPanel}>
                  {analyticsLoading && <p>Loading…</p>}
                  {!analyticsLoading && analytics && Object.keys(analytics.totals).length === 0 && (
                    <p>No activity recorded yet.</p>
                  )}
                  {!analyticsLoading && analytics && Object.entries(analytics.totals).map(([type, count]) => (
                    <div key={type} className={styles.analyticsRow}>
                      <span>{type.replace(/_/g, ' ')}</span>
                      <strong>{count}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </RolePageWrapper>
  )
}
