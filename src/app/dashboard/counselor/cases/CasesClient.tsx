'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { HeartIcon, SearchIcon, XIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string }

const TABS = ['open', 'monitoring', 'closed'] as const
type Tab = typeof TABS[number]

const RISK_COLOR: Record<string, string> = {
  low: 'var(--status-ok, #10B981)',
  moderate: 'var(--status-warn, #E4572E)',
  high: '#EF4444',
}

export default function CasesClient({ profile, school, userId }: Props) {
  const [tab, setTab] = useState<Tab>('open')
  const [cases, setCases] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const { toast, showToast } = useToast()

  async function load(status: Tab) {
    setLoading(true)
    try {
      const res = await fetch(`/api/counselor/cases?status=${status}`)
      const json = await res.json()
      setCases(res.ok ? (json.cases ?? []) : [])
      if (!res.ok) showToast(json.error ?? 'Could not load caseload.')
    } catch {
      showToast('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(tab) }, [tab])

  return (
    <RolePageWrapper userId={userId} role="counselor" profile={profile} school={school} title="Caseload">
      <Toast toast={toast} />

      <div className={motion.riseIn} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`${motion.pressable} ${motion.focusable}`}
            style={{
              flex: 1, height: 36, borderRadius: 9, fontSize: '0.8rem', fontWeight: 700,
              textTransform: 'capitalize', cursor: 'pointer',
              border: tab === t ? 'none' : '1px solid var(--glass-border)',
              background: tab === t ? 'var(--brand)' : 'var(--glass-bg)',
              color: tab === t ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <ActionButton onClick={() => setShowNew(true)} fullWidth style={{ marginBottom: 16 }}>
        + Open a new case
      </ActionButton>

      {showNew && (
        <NewCaseForm
          schoolId={school?.id}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); setTab('open'); load('open'); showToast('Case opened.') }}
          onError={(msg) => showToast(msg)}
        />
      )}

      {loading ? (
        <SkeletonList count={4} variant="card" />
      ) : cases.length === 0 ? (
        <EmptyState
          icon={<HeartIcon size={32} color="var(--text-muted)" />}
          title={`No ${tab} cases`}
          subtitle={
            tab === 'open'
              ? 'Cases you open, or accept from a referral, will appear here.'
              : tab === 'monitoring'
              ? 'Move a case to Monitoring from its case page once active support winds down.'
              : 'Closed cases stay here for your own history.'
          }
        />
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {cases.map((c: any, i: number) => (
            <Link
              key={c.id}
              href={`/dashboard/counselor/cases/${c.id}`}
              className={`glass-card ${motion.pressable} ${motion.riseIn}`}
              style={{
                display: 'block', padding: 16, borderRadius: 'var(--radius-lg)',
                textDecoration: 'none', color: 'var(--text-primary)',
                animationDelay: `${i * 40}ms`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>{c.student?.full_name ?? 'Student'}</p>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '4px 0 0', textTransform: 'capitalize' }}>
                    {c.category?.replace('_', ' ')} · {c.student?.class_level ?? ''}
                  </p>
                </div>
                <span style={{
                  fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999,
                  color: RISK_COLOR[c.risk_level] ?? RISK_COLOR.low,
                  background: `${RISK_COLOR[c.risk_level] ?? RISK_COLOR.low}18`,
                  textTransform: 'capitalize',
                }}>
                  {c.risk_level} risk
                </span>
              </div>
              {c.summary && (
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '10px 0 0' }}>{c.summary}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </RolePageWrapper>
  )
}

function NewCaseForm({
  schoolId, onClose, onCreated, onError,
}: { schoolId?: string; onClose: () => void; onCreated: () => void; onError: (msg: string) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [selected, setSelected] = useState<any | null>(null)
  const [category, setCategory] = useState('general')
  const [riskLevel, setRiskLevel] = useState('low')
  const [summary, setSummary] = useState('')
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!schoolId || query.trim().length < 2 || selected) { setResults([]); return }
    let cancelled = false
    setSearching(true)
    const supabase = createClient()
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, class_level')
        .eq('school_id', schoolId)
        .eq('role', 'student')
        .ilike('full_name', `%${query.trim()}%`)
        .limit(8)
      if (!cancelled) { setResults(data ?? []); setSearching(false) }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [query, schoolId, selected])

  async function submit() {
    if (!selected) { onError('Select a student first.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/counselor/cases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selected.id, category, riskLevel, summary }),
      })
      const json = await res.json()
      if (!res.ok) { onError(json.error ?? 'Could not create the case.'); setSaving(false); return }
      onCreated()
    } catch {
      onError('Network error. Please try again.')
      setSaving(false)
    }
  }

  return (
    <div className={`glass-card ${motion.riseIn}`} style={{ padding: 16, borderRadius: 'var(--radius-lg)', marginBottom: 16, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <p style={{ fontWeight: 700, fontSize: '0.9rem', margin: 0 }}>New case</p>
        <button onClick={onClose} className={motion.pressable} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
          <XIcon size={18} color="var(--text-muted)" />
        </button>
      </div>

      {selected ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderRadius: 9, background: 'var(--input-bg)' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{selected.full_name}</span>
          <button onClick={() => { setSelected(null); setQuery('') }} className={motion.pressable} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.75rem', cursor: 'pointer' }}>
            Change
          </button>
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', height: 40, borderRadius: 9, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}>
            <SearchIcon size={16} color="var(--text-muted)" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search student by name"
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: '0.85rem', color: 'var(--text-primary)' }}
            />
          </div>
          {(searching || results.length > 0) && query.trim().length >= 2 && (
            <div className="glass-card" style={{ marginTop: 6, borderRadius: 9, overflow: 'hidden' }}>
              {searching ? (
                <div style={{ padding: 12, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Searching…</div>
              ) : (
                results.map(r => (
                  <button
                    key={r.id}
                    onClick={() => { setSelected(r); setResults([]) }}
                    className={motion.pressable}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-primary)' }}
                  >
                    {r.full_name} <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{r.class_level}</span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <select value={category} onChange={e => setCategory(e.target.value)}
          style={{ height: 38, borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '0 8px', fontSize: '0.8rem' }}>
          <option value="general">General</option>
          <option value="academic_risk">Academic risk</option>
          <option value="attendance">Attendance</option>
          <option value="behavioral">Behavioral</option>
          <option value="emotional">Emotional</option>
          <option value="family">Family</option>
          <option value="peer">Peer</option>
          <option value="other">Other</option>
        </select>
        <select value={riskLevel} onChange={e => setRiskLevel(e.target.value)}
          style={{ height: 38, borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: '0 8px', fontSize: '0.8rem' }}>
          <option value="low">Low risk</option>
          <option value="moderate">Moderate risk</option>
          <option value="high">High risk</option>
        </select>
      </div>

      <textarea
        value={summary}
        onChange={e => setSummary(e.target.value)}
        placeholder="Short, non-clinical summary for the case list (optional)"
        rows={2}
        style={{ borderRadius: 8, border: '1px solid var(--input-border)', background: 'var(--input-bg)', color: 'var(--text-primary)', padding: 10, fontSize: '0.82rem', resize: 'vertical' }}
      />

      <ActionButton onClick={submit} loading={saving} loadingLabel="Opening case…" disabled={!selected} fullWidth>
        Open case
      </ActionButton>
    </div>
  )
}
