'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import styles from '@/components/subscription/subscription.module.css'
import { PRINCIPAL_FEATURE_GROUPS } from '../featureGroups'

export interface SubscriptionStats {
  term: null | {
    id: string
    name: string
    academic_year: string
    starts_on: string
    ends_on: string
    grace_ends_on: string
    is_default?: boolean
  }
  total_students?: number
  paid_students?: number
  unpaid_students?: number
  paid_percent?: number | null
  by_class?: { class: string; total: number; paid: number; paid_percent: number | null }[]
}

export interface TermRow {
  id: string
  academic_year: string
  term_name: string
  starts_on: string
  ends_on: string
  grace_days: number
}

interface Props {
  userId: string
  profile: any
  school: any
  schoolId: string
  stats: SubscriptionStats
  terms: TermRow[]
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SubscriptionClient({ userId, profile, school, schoolId, stats }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    academic_year: '', term_name: 'First Term', starts_on: '', ends_on: '', grace_days: 14,
  })

  async function addTerm(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaved(false)
    if (!form.academic_year || !form.starts_on || !form.ends_on) {
      setError('Fill in every field.')
      return
    }
    if (form.ends_on <= form.starts_on) {
      setError('End date must be after the start date.')
      return
    }
    setBusy(true)
    const supabase = createClient()
    // Upsert so the principal's own dates replace the automatic default term
    // for the same year and term name instead of clashing with it. Existing
    // payments stay attached because the row id does not change.
    const { error: err } = await supabase.from('school_terms').upsert({
      school_id: schoolId,
      academic_year: form.academic_year.trim(),
      term_name: form.term_name,
      starts_on: form.starts_on,
      ends_on: form.ends_on,
      grace_days: Number(form.grace_days),
      is_default: false,
    }, { onConflict: 'school_id,academic_year,term_name' })
    setBusy(false)
    if (err) {
      setError('Could not save. Try again.')
      return
    }
    setForm({ ...form, starts_on: '', ends_on: '' })
    setSaved(true)
    router.refresh()
  }

  const term = stats.term
  const percent = stats.paid_percent ?? 0

  return (
    <RoleSubHeader
      userId={userId} role="principal" profile={profile} school={school}
      title="Subscriptions" featureGroups={PRINCIPAL_FEATURE_GROUPS}
    >
      <div style={{ maxWidth: 640, margin: '0 auto', padding: 'var(--space-5, 20px)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {term ? (
          <section className={styles.card} aria-label="Payment statistics">
            <p className={styles.title}>{term.name} &middot; {term.academic_year}</p>
            <p className={styles.muted}>Unpaid students lock after {fmtDate(term.grace_ends_on)}</p>
            {term.is_default && <p className={styles.notice}>Standard school calendar in use.</p>}

            <div className={styles.stats}>
              <div><p className={styles.statNum}>{percent}%</p><p className={styles.statLabel}>paid</p></div>
              <div><p className={styles.statNum}>{stats.paid_students ?? 0}</p><p className={styles.statLabel}>students paid</p></div>
              <div><p className={styles.statNum}>{stats.unpaid_students ?? 0}</p><p className={styles.statLabel}>unpaid</p></div>
            </div>

            <div className={styles.bar} role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
              <div className={styles.barFill} style={{ width: `${percent}%` }} />
            </div>

            {(stats.by_class ?? []).length > 0 && (
              <ul className={styles.rows}>
                {(stats.by_class ?? []).map(c => (
                  <li key={c.class} className={styles.row}>
                    <span>{c.class}</span>
                    <span>{c.paid}/{c.total} &middot; {c.paid_percent ?? 0}%</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section className={styles.card}>
            <p className={styles.title}>No term running</p>
            <p className={styles.muted}>Nothing is due and nobody is locked.</p>
          </section>
        )}

        <section className={styles.card} aria-label="Term dates">
          <p className={styles.title}>Set term dates</p>
          <form onSubmit={addTerm} className={styles.form}>
            <div className={styles.two}>
              <label className={styles.field}>Year
                <input className="input" placeholder="2026/2027" value={form.academic_year}
                  onChange={e => setForm({ ...form, academic_year: e.target.value })} />
              </label>
              <label className={styles.field}>Term
                <select className="input" value={form.term_name} onChange={e => setForm({ ...form, term_name: e.target.value })}>
                  <option>First Term</option>
                  <option>Second Term</option>
                  <option>Third Term</option>
                </select>
              </label>
            </div>
            <div className={styles.two}>
              <label className={styles.field}>Starts
                <input className="input" type="date" value={form.starts_on} onChange={e => setForm({ ...form, starts_on: e.target.value })} />
              </label>
              <label className={styles.field}>Ends
                <input className="input" type="date" value={form.ends_on} onChange={e => setForm({ ...form, ends_on: e.target.value })} />
              </label>
            </div>
            <label className={styles.field}>Grace days
              <input className="input" type="number" min={0} max={60} value={form.grace_days}
                onChange={e => setForm({ ...form, grace_days: Number(e.target.value) })} />
            </label>
            {error && <p role="alert" className={styles.error}>{error}</p>}
            {saved && !error && <p className={styles.success}>Saved</p>}
            <button type="submit" disabled={busy} className={styles.btn} aria-busy={busy}>
              {busy ? <><span className={styles.spinner} aria-hidden="true" />Saving</> : 'Save'}
            </button>
          </form>
        </section>
        <div style={{ height: 100 }} />
      </div>
    </RoleSubHeader>
  )
}
