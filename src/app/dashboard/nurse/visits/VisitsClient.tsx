'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { HeartIcon, PlusIcon, XIcon, SearchIcon, UserIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import styles from '../nurse.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string }

const OUTCOMES = [
  { value: 'returned_to_class', label: 'Returned to class' },
  { value: 'sent_home', label: 'Sent home' },
  { value: 'hospital_referral', label: 'Hospital referral' },
  { value: 'monitoring', label: 'Monitoring' },
  { value: 'other', label: 'Other' },
]

const OUTCOME_COLOR: Record<string, string> = {
  returned_to_class: 'var(--status-ok, #10B981)',
  sent_home: 'var(--status-warn, #E4572E)',
  hospital_referral: '#EF4444',
  monitoring: 'var(--status-warn, #E4572E)',
  other: 'var(--text-muted)',
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function VisitsClient({ profile, school, userId }: Props) {
  const { toast, showToast } = useToast()
  const [visits, setVisits] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  // Form state
  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState<any[]>([])
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null)
  const [reason, setReason] = useState('')
  const [symptoms, setSymptoms] = useState('')
  const [treatmentGiven, setTreatmentGiven] = useState('')
  const [outcome, setOutcome] = useState('returned_to_class')
  const [parentNotified, setParentNotified] = useState(false)
  const [temperatureC, setTemperatureC] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  async function loadVisits() {
    setLoading(true)
    try {
      const res = await fetch('/api/nurse/visits')
      const json = await res.json()
      setVisits(json.ok ? json.visits : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadVisits() }, [])

  useEffect(() => {
    if (!studentQuery.trim() || selectedStudent) { setStudentResults([]); return }
    const t = setTimeout(async () => {
      const res = await fetch(`/api/nurse/health-records?search=${encodeURIComponent(studentQuery)}`)
      const json = await res.json()
      setStudentResults(json.ok ? json.records.map((r: any) => r.student) : [])
    }, 250)
    return () => clearTimeout(t)
  }, [studentQuery, selectedStudent])

  function resetForm() {
    setSelectedStudent(null); setStudentQuery(''); setReason(''); setSymptoms('')
    setTreatmentGiven(''); setOutcome('returned_to_class'); setParentNotified(false)
    setTemperatureC(''); setNotes('')
  }

  async function submitVisit() {
    if (!selectedStudent || !reason.trim()) { showToast('Pick a student and enter a reason.'); return }
    setSaving(true)
    try {
      const res = await fetch('/api/nurse/visits', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selectedStudent.id, reason, symptoms, treatmentGiven, outcome,
          parentNotified, temperatureC: temperatureC ? Number(temperatureC) : undefined, notes,
        }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not log visit.'); return }
      showToast('Visit logged.')
      setShowForm(false); resetForm(); loadVisits()
    } finally { setSaving(false) }
  }

  return (
    <RolePageWrapper userId={userId} role="nurse" profile={profile} school={school} title="Clinic Visits">
      <main className={styles.main}>
        <ActionButton onClick={() => setShowForm(true)} icon={<PlusIcon size={16} />} fullWidth>
          Log a Visit
        </ActionButton>

        <p className={styles.sectionLabel} style={{ marginTop: 'var(--space-5)' }}>Recent visits</p>
        {loading ? <SkeletonList count={4} variant="card" /> : visits.length === 0 ? (
          <EmptyState
            icon={<HeartIcon size={28} />}
            title="No visits logged yet"
            subtitle="Every clinic visit you log will show up here, most recent first."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visits.map(v => {
              const student = Array.isArray(v.profiles) ? v.profiles[0] : v.profiles
              return (
                <div key={v.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.86rem', margin: 0 }}>{student?.full_name ?? 'Student'}</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '2px 0 0' }}>{v.reason}</p>
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: OUTCOME_COLOR[v.outcome] ?? 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {OUTCOMES.find(o => o.value === v.outcome)?.label ?? v.outcome}
                    </span>
                  </div>
                  {v.treatment_given && <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '8px 0 0' }}>{v.treatment_given}</p>}
                  <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '8px 0 0' }}>
                    {formatDate(v.visited_at)}{v.parent_notified ? ' · Parent notified' : ''}
                  </p>
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }} />
      </main>

      {showForm && (
        <div className={styles.overlay ?? undefined} onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Log a Clinic Visit</p>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>

            {!selectedStudent ? (
              <div>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <SearchIcon size={14} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                  <input
                    value={studentQuery} onChange={e => setStudentQuery(e.target.value)}
                    placeholder="Search student by name"
                    style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {studentResults.map(s => (
                    <button key={s.id} onClick={() => setSelectedStudent(s)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8, border: 'none', background: 'var(--glass-bg)', cursor: 'pointer', textAlign: 'left' }}>
                      <UserIcon size={14} /> {s.full_name}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, borderRadius: 10, background: 'var(--glass-bg)' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.86rem' }}>{selectedStudent.full_name}</span>
                  <button onClick={() => setSelectedStudent(null)} style={{ background: 'none', border: 'none', color: 'var(--brand)', fontSize: '0.78rem', cursor: 'pointer' }}>Change</button>
                </div>
                <input placeholder="Reason for visit" value={reason} onChange={e => setReason(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <textarea placeholder="Symptoms" value={symptoms} onChange={e => setSymptoms(e.target.value)} rows={2}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <input placeholder="Temperature °C (optional)" value={temperatureC} onChange={e => setTemperatureC(e.target.value)} type="number" step="0.1"
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <textarea placeholder="Treatment given" value={treatmentGiven} onChange={e => setTreatmentGiven(e.target.value)} rows={2}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <select value={outcome} onChange={e => setOutcome(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}>
                  {OUTCOMES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
                  <input type="checkbox" checked={parentNotified} onChange={e => setParentNotified(e.target.checked)} /> Parent notified
                </label>
                <textarea placeholder="Additional notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <ActionButton onClick={submitVisit} loading={saving} loadingLabel="Saving…" fullWidth>Save Visit</ActionButton>
              </div>
            )}
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </RolePageWrapper>
  )
}
