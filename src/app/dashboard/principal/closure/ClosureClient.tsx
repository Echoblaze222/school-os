'use client'

// Principal: switch school closure / learning-from-home mode on or off.
// Reuses the Students page styles; all data goes through /api/principal/closure.

import { useCallback, useEffect, useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import { PRINCIPAL_FEATURE_GROUPS } from '../featureGroups'
import { CheckIcon, XIcon, AlertIcon } from '@/components/Icons'
import { CLOSURE_REASONS, bannerTitle, reasonLabel } from '@/lib/closure'
import styles from '../students/students.module.css'

interface Props { profile: any; school: any; userId: string }

export default function ClosureClient({ profile, school, userId }: Props) {
  const sc = school?.primary_color ?? '#800020'
  const [loading, setLoading] = useState(true)
  const [problem, setProblem] = useState<string | null>(null)
  const [current, setCurrent] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [form, setForm] = useState({ mode: 'remote', reason: 'security', message: '', expected_end_on: '', notify: true })
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/principal/closure', { cache: 'no-store' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setProblem(json.error ?? 'Could not load'); setLoading(false); return }
      setProblem(null)
      setCurrent(json.current)
      setHistory(json.history ?? [])
    } catch {
      setProblem('Network error. Check your connection and try again.')
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function start() {
    setBusy(true)
    const res = await fetch('/api/principal/closure', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { showToast(json.error ?? 'Could not save', false); return }
    showToast(form.notify ? `Closure is on. ${json.notified} people notified.` : 'Closure is on.')
    setForm(f => ({ ...f, message: '', expected_end_on: '' }))
    load()
  }

  async function end() {
    if (!current) return
    if (!window.confirm('End the closure and tell everyone school is open again?')) return
    setBusy(true)
    const res = await fetch('/api/principal/closure', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: current.id }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { showToast(json.error ?? 'Could not end', false); return }
    showToast('School is open again.')
    load()
  }

  return (
    <RoleSubHeader userId={userId} role="principal" profile={profile} school={school} title="Closure mode" featureGroups={PRINCIPAL_FEATURE_GROUPS}>
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? <CheckIcon size={14} /> : <XIcon size={14} />} {toast.msg}
        </div>
      )}
      <div className={styles.container}>
        {problem ? (
          <div className={styles.empty}><AlertIcon size={32} /><p>{problem}</p></div>
        ) : loading ? (
          <div className={styles.loadingList}>{[1, 2].map(i => <div key={i} className={styles.skeleton} />)}</div>
        ) : (
          <>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '0 0 12px' }}>
              If you have to close the school (security, flooding, outbreak, strike), switch it on here. Students and parents see a banner, and everyone is notified.
            </p>

            {current ? (
              <div className={styles.formCard}>
                <p className={styles.formTitle}>{bannerTitle(current.mode)} · {reasonLabel(current.reason)}</p>
                {current.message && <p style={{ fontSize: '0.85rem', margin: '0 0 6px' }}>{current.message}</p>}
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                  Since {current.starts_on}{current.expected_end_on ? ` · expected back after ${current.expected_end_on}` : ''}
                  {!current.live ? ' · not showing to families right now (outside its dates)' : ''}
                </p>
                <div className={styles.formActions}>
                  <button className={`${styles.saveBtn} pressable`} style={{ background: '#10B981' }} onClick={end} disabled={busy}>
                    School is open again
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.formCard}>
                <p className={styles.formTitle}>Start a closure</p>
                <div className={styles.formGrid}>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>What is happening?</label>
                    <select className={styles.fieldInput} value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
                      <option value="remote">Closed, learning from home</option>
                      <option value="closed">Closed, no lessons</option>
                    </select>
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Reason</label>
                    <select className={styles.fieldInput} value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}>
                      {CLOSURE_REASONS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div className={styles.fieldGroup}>
                    <label className={styles.fieldLabel}>Expected back after (optional)</label>
                    <input className={styles.fieldInput} type="date" value={form.expected_end_on} onChange={e => setForm(f => ({ ...f, expected_end_on: e.target.value }))} />
                  </div>
                </div>
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>{form.mode === 'remote' ? 'How will learning work? (required)' : 'Message to families (optional)'}</label>
                  <textarea className={styles.fieldInput} style={{ width: '100%', minHeight: 90 }}
                    placeholder={form.mode === 'remote' ? 'e.g. New assignments are posted every morning by 9am. Live classes run on the app at 10am.' : 'e.g. We will update you by Friday.'}
                    value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))} />
                </div>
                <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: '0.82rem', margin: '10px 0' }}>
                  <input type="checkbox" checked={form.notify} onChange={e => setForm(f => ({ ...f, notify: e.target.checked }))} />
                  Notify all students, parents and teachers now
                </label>
                <div className={styles.formActions}>
                  <button className={`${styles.saveBtn} pressable`} style={{ background: sc }} onClick={start}
                    disabled={busy || (form.mode === 'remote' && !form.message.trim())}>
                    {busy ? 'Saving…' : 'Start closure'}
                  </button>
                </div>
              </div>
            )}

            {history.length > 0 && (
              <>
                <p className={styles.formTitle} style={{ marginTop: 18 }}>Earlier closures</p>
                <div className={styles.studentList}>
                  {history.map(h => (
                    <div key={h.id} className={styles.studentRow}>
                      <div className={styles.studentInfo}>
                        <p className={styles.studentName}>{bannerTitle(h.mode)} · {reasonLabel(h.reason)}</p>
                        <div className={styles.studentMeta}>
                          <span>{h.starts_on}{h.ended_at ? ` to ${String(h.ended_at).slice(0, 10)}` : ''}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
        <div style={{ height: 100 }} />
      </div>
    </RoleSubHeader>
  )
}
