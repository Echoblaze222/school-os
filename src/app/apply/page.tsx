'use client'
// src/app/apply/page.tsx
// Public, unauthenticated. Reuses the same localStorage school-selection
// key /login uses (schoolos_selected_school) so a school picked here is
// remembered if the applicant later visits /login, and vice versa:
// without touching /select-school's own code.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './apply.module.css'

const SCHOOL_KEY = 'schoolos_selected_school'

interface SchoolResult { id: string; name: string; city?: string; state?: string; primary_color?: string }
interface RoleOption { id: string; label: string; category: string }

export default function ApplyPage() {
  const supabase = createClient()

  const [school, setSchool]       = useState<SchoolResult | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [results, setResults]     = useState<SchoolResult[]>([])
  const [searching, setSearching] = useState(false)

  const [roles, setRoles] = useState<RoleOption[]>([])
  const [form, setForm] = useState({
    fullName: '', email: '', phone: '', roleAppliedFor: '',
    password: '', confirmPassword: '', verificationMethod: 'remote',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem(SCHOOL_KEY)
    if (stored) {
      try { setSchool(JSON.parse(stored)) } catch { /* ignore malformed value */ }
    }
    fetch('/api/apply/roles').then(r => r.json()).then(d => setRoles(d.roles ?? [])).catch(() => {})
  }, [])

  async function searchSchools(term: string) {
    setSearchTerm(term)
    if (term.trim().length < 2) { setResults([]); return }
    setSearching(true)
    const { data } = await supabase
      .from('schools')
      .select('id, name, city, state, primary_color')
      .ilike('name', `%${term}%`)
      .eq('is_platform_active', true)
      .limit(8)
    setResults(data ?? [])
    setSearching(false)
  }

  function pickSchool(s: SchoolResult) {
    setSchool(s)
    setResults([])
    localStorage.setItem(SCHOOL_KEY, JSON.stringify({ id: s.id, name: s.name, primaryColor: s.primary_color ?? null }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!school) return setError('Please select your school first.')
    if (!form.fullName || !form.email || !form.roleAppliedFor) return setError('Please fill in all required fields.')
    if (form.password.length < 8) return setError('Password must be at least 8 characters.')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.')

    setSubmitting(true)
    try {
      const res = await fetch('/api/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolId: school.id, fullName: form.fullName, email: form.email, phone: form.phone,
          roleAppliedFor: form.roleAppliedFor, password: form.password,
          verificationMethod: form.verificationMethod,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Something went wrong. Please try again.')
      setSuccess(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (success) {
    return (
      <div className={styles.page}>
        <div className={styles.wrap}>
          <div className={styles.successBox}>
            <h1 className={styles.title}>Application submitted</h1>
            <p>
              {school?.name}&apos;s ICT team will review your application and verify your identity.
              You&apos;ll be notified by email once your access code is ready, you won&apos;t need to
              set a password again, the one you just chose will already work.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <h1 className={styles.title}>Apply for account access</h1>
        <p className={styles.sub}>For new staff or students who don&apos;t yet have a SchoolOS account.</p>

        {school ? (
          <div className={styles.schoolChip}>
            <span>{school.name}</span>
            <button type="button" className={styles.changeBtn} onClick={() => setSchool(null)}>Change</button>
          </div>
        ) : (
          <div className={styles.field}>
            <label className={styles.label}>Find your school</label>
            <input
              className={styles.input}
              placeholder="Start typing your school's name…"
              value={searchTerm}
              onChange={e => searchSchools(e.target.value)}
            />
            {searching && <p className={styles.hint}>Searching…</p>}
            {results.map(s => (
              <div key={s.id} className={styles.searchResult} onClick={() => pickSchool(s)}>
                <strong>{s.name}</strong>
                {(s.city || s.state) && <div className={styles.hint}>{[s.city, s.state].filter(Boolean).join(', ')}</div>}
              </div>
            ))}
          </div>
        )}

        {school && (
          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label className={styles.label}>Full name</label>
              <input className={styles.input} value={form.fullName}
                onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} required />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Email</label>
              <input className={styles.input} type="email" value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Phone (optional)</label>
              <input className={styles.input} type="tel" value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Role you're applying for</label>
              <select className={styles.select} value={form.roleAppliedFor}
                onChange={e => setForm(f => ({ ...f, roleAppliedFor: e.target.value }))} required>
                <option value="">Select a role…</option>
                {roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Choose a password</label>
              <input className={styles.input} type="password" value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required minLength={8} />
              <p className={styles.hint}>At least 8 characters. This will be your real login password once approved, no separate setup step later.</p>
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Confirm password</label>
              <input className={styles.input} type="password" value={form.confirmPassword}
                onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))} required minLength={8} />
            </div>

            <div className={styles.field}>
              <label className={styles.label}>Verification</label>
              <select className={styles.select} value={form.verificationMethod}
                onChange={e => setForm(f => ({ ...f, verificationMethod: e.target.value }))}>
                <option value="remote">I'll verify remotely (documents, phone call)</option>
                <option value="in_person">I'll visit the school in person</option>
              </select>
            </div>

            {error && <p className={styles.error}>{error}</p>}

            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit application'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
