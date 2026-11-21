'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ArrowLeftIcon } from '@/components/Icons'

export interface SubscriptionStats {
  term: null | {
    id: string
    name: string
    academic_year: string
    starts_on: string
    ends_on: string
    grace_ends_on: string
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
  schoolId: string
  stats: SubscriptionStats
  terms: TermRow[]
}

const card: React.CSSProperties = {
  border: '1px solid rgba(128,128,128,0.25)',
  borderRadius: 14,
  padding: 16,
}
const input: React.CSSProperties = {
  height: 42, borderRadius: 10, border: '1px solid rgba(128,128,128,0.35)',
  padding: '0 10px', background: 'transparent', color: 'inherit', width: '100%', boxSizing: 'border-box',
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function SubscriptionClient({ schoolId, stats, terms }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    academic_year: '', term_name: 'First Term', starts_on: '', ends_on: '', grace_days: 14,
  })

  async function addTerm(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!form.academic_year || !form.starts_on || !form.ends_on) {
      setError('Fill in the academic year and both dates.')
      return
    }
    if (form.ends_on <= form.starts_on) {
      setError('The end date must be after the start date.')
      return
    }
    setBusy(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('school_terms').insert({
      school_id: schoolId,
      academic_year: form.academic_year.trim(),
      term_name: form.term_name,
      starts_on: form.starts_on,
      ends_on: form.ends_on,
      grace_days: Number(form.grace_days),
    })
    setBusy(false)
    if (err) {
      setError(err.code === '23505' ? 'That term already exists for this academic year.' : 'Could not save the term. Please try again.')
      return
    }
    setForm({ ...form, starts_on: '', ends_on: '' })
    router.refresh()
  }

  const term = stats.term

  return (
    <main style={{ maxWidth: 640, margin: '0 auto', padding: '24px 16px 96px', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button
          onClick={() => router.push('/dashboard/principal')}
          className="pressable"
          aria-label="Back"
          style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}
        >
          <ArrowLeftIcon size={18} />
        </button>
        <h1 style={{ margin: 0, fontSize: '1.3rem' }}>Subscriptions</h1>
      </header>

      <p style={{ margin: 0, fontSize: '0.88rem', opacity: 0.75 }}>
        Parents and students pay their own term subscription. Your school keeps running either way. Only students who have not paid are locked, after the grace period.
      </p>

      {/* ── Statistics ── */}
      {term ? (
        <section style={card} aria-label="Payment statistics">
          <p style={{ margin: 0, fontWeight: 700 }}>{term.name} &middot; {term.academic_year}</p>
          <p style={{ margin: '2px 0 14px', fontSize: '0.8rem', opacity: 0.65 }}>
            {fmtDate(term.starts_on)} to {fmtDate(term.ends_on)} &middot; unpaid students lock after {fmtDate(term.grace_ends_on)}
          </p>

          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 12 }}>
            <div>
              <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800 }}>{stats.paid_percent ?? 0}%</p>
              <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.65 }}>of students paid</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: 'var(--success, #10B981)' }}>{stats.paid_students ?? 0}</p>
              <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.65 }}>paid</p>
            </div>
            <div>
              <p style={{ margin: 0, fontSize: '1.8rem', fontWeight: 800, color: 'var(--error, #ef4444)' }}>{stats.unpaid_students ?? 0}</p>
              <p style={{ margin: 0, fontSize: '0.78rem', opacity: 0.65 }}>unpaid</p>
            </div>
          </div>

          <div style={{ height: 8, borderRadius: 999, background: 'rgba(128,128,128,0.2)', overflow: 'hidden' }}>
            <div style={{ width: `${stats.paid_percent ?? 0}%`, height: '100%', background: 'var(--success, #10B981)' }} />
          </div>

          {(stats.by_class ?? []).length > 0 && (
            <ul style={{ listStyle: 'none', margin: '16px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(stats.by_class ?? []).map(c => (
                <li key={c.class} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem' }}>
                  <span>{c.class}</span>
                  <span style={{ opacity: 0.8 }}>{c.paid}/{c.total} paid ({c.paid_percent ?? 0}%)</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        <section style={card}>
          <p style={{ margin: 0, fontWeight: 700 }}>No active term</p>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', opacity: 0.75 }}>
            Set this term&apos;s dates below. Until a term is active nobody is locked and nothing is due.
          </p>
        </section>
      )}

      {/* ── Term dates ── */}
      <section style={card} aria-label="Term dates">
        <p style={{ margin: '0 0 12px', fontWeight: 700 }}>School term dates</p>

        {terms.length > 0 && (
          <ul style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {terms.map(t => (
              <li key={t.id} style={{ fontSize: '0.85rem', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>{t.term_name} &middot; {t.academic_year}</span>
                <span style={{ opacity: 0.7 }}>{fmtDate(t.starts_on)} to {fmtDate(t.ends_on)} &middot; {t.grace_days}d grace</span>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addTerm} style={{ display: 'grid', gap: 10 }}>
          <input style={input} placeholder="Academic year, e.g. 2026/2027" value={form.academic_year}
            onChange={e => setForm({ ...form, academic_year: e.target.value })} />
          <select style={input} value={form.term_name} onChange={e => setForm({ ...form, term_name: e.target.value })}>
            <option>First Term</option>
            <option>Second Term</option>
            <option>Third Term</option>
          </select>
          <label style={{ fontSize: '0.78rem', opacity: 0.7 }}>Term starts
            <input style={input} type="date" value={form.starts_on} onChange={e => setForm({ ...form, starts_on: e.target.value })} />
          </label>
          <label style={{ fontSize: '0.78rem', opacity: 0.7 }}>Term ends
            <input style={input} type="date" value={form.ends_on} onChange={e => setForm({ ...form, ends_on: e.target.value })} />
          </label>
          <label style={{ fontSize: '0.78rem', opacity: 0.7 }}>Grace period after term starts (days, 0 to 60)
            <input style={input} type="number" min={0} max={60} value={form.grace_days}
              onChange={e => setForm({ ...form, grace_days: Number(e.target.value) })} />
          </label>
          {error && <p role="alert" style={{ margin: 0, color: 'var(--error, #ef4444)', fontSize: '0.82rem' }}>{error}</p>}
          <button type="submit" disabled={busy} className="pressable"
            style={{ height: 46, borderRadius: 12, border: 'none', fontWeight: 700, cursor: 'pointer', background: 'var(--primary, #800020)', color: '#fff' }}>
            {busy ? 'Saving…' : 'Add term'}
          </button>
        </form>
      </section>
    </main>
  )
}
