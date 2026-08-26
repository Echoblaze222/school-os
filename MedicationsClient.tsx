'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClockIcon, PlusIcon, XIcon, SearchIcon, UserIcon, CheckIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import styles from '../nurse.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string }

const STATUS_COLOR: Record<string, string> = {
  pending: 'var(--status-warn, #E4572E)',
  administered: 'var(--status-ok, #10B981)',
  refused: '#EF4444',
  missed: '#EF4444',
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' })
}

export default function MedicationsClient({ profile, school, userId }: Props) {
  const { toast, showToast } = useToast()
  const [meds, setMeds] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'all'>('pending')
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [markingId, setMarkingId] = useState<string | null>(null)

  const [studentQuery, setStudentQuery] = useState('')
  const [studentResults, setStudentResults] = useState<any[]>([])
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null)
  const [medicationName, setMedicationName] = useState('')
  const [dosage, setDosage] = useState('')
  const [scheduledFor, setScheduledFor] = useState('')
  const [notes, setNotes] = useState('')

  async function loadMeds() {
    setLoading(true)
    try {
      const res = await fetch(`/api/nurse/medications${filter === 'pending' ? '?status=pending' : ''}`)
      const json = await res.json()
      setMeds(json.ok ? json.medications : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadMeds() }, [filter])

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
    setSelectedStudent(null); setStudentQuery(''); setMedicationName(''); setDosage(''); setScheduledFor(''); setNotes('')
  }

  async function submitSchedule() {
    if (!selectedStudent || !medicationName.trim() || !dosage.trim() || !scheduledFor) {
      showToast('Fill in student, medication, dosage and time.'); return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/nurse/medications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudent.id, medicationName, dosage, scheduledFor: new Date(scheduledFor).toISOString(), notes }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not schedule.'); return }
      showToast('Medication scheduled.')
      setShowForm(false); resetForm(); loadMeds()
    } finally { setSaving(false) }
  }

  async function markStatus(id: string, status: string) {
    setMarkingId(id)
    try {
      const res = await fetch('/api/nurse/medications', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not update.'); return }
      loadMeds()
    } finally { setMarkingId(null) }
  }

  return (
    <RolePageWrapper userId={userId} role="nurse" profile={profile} school={school} title="Medications">
      <main className={styles.main}>
        <ActionButton onClick={() => setShowForm(true)} icon={<PlusIcon size={16} />} fullWidth>
          Schedule a Medication
        </ActionButton>

        <div style={{ display: 'flex', gap: 8, margin: '14px 0' }}>
          {(['pending', 'all'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
                border: f === filter ? 'none' : '1px solid var(--glass-border)',
                background: f === filter ? 'var(--brand)' : 'transparent',
                color: f === filter ? '#fff' : 'var(--text-secondary)',
              }}>
              {f === 'pending' ? 'Due' : 'All'}
            </button>
          ))}
        </div>

        {loading ? <SkeletonList count={4} variant="card" /> : meds.length === 0 ? (
          <EmptyState icon={<ClockIcon size={28} />} title="Nothing scheduled" subtitle="Scheduled medications will show up here." />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {meds.map(m => {
              const student = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles
              return (
                <div key={m.id} className={`glass-card ${motion.pressable}`} style={{ padding: 14, borderRadius: 'var(--radius-lg)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div>
                      <p style={{ fontWeight: 700, fontSize: '0.86rem', margin: 0 }}>{student?.full_name ?? 'Student'}</p>
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>{m.medication_name} · {m.dosage}</p>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: '4px 0 0' }}>{formatDateTime(m.scheduled_for)}</p>
                    </div>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: STATUS_COLOR[m.status], whiteSpace: 'nowrap' }}>{m.status}</span>
                  </div>
                  {m.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                      <button onClick={() => markStatus(m.id, 'administered')} disabled={markingId === m.id}
                        style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: 'var(--status-ok, #10B981)', color: '#fff', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                        <CheckIcon size={12} /> Administered
                      </button>
                      <button onClick={() => markStatus(m.id, 'refused')} disabled={markingId === m.id}
                        style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                        Refused
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }} />
      </main>

      {showForm && (
        <div onClick={() => setShowForm(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>Schedule a Medication</p>
              <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>

            {!selectedStudent ? (
              <div>
                <div style={{ position: 'relative', marginBottom: 10 }}>
                  <SearchIcon size={14} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                  <input value={studentQuery} onChange={e => setStudentQuery(e.target.value)} placeholder="Search student by name"
                    style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
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
                <input placeholder="Medication name" value={medicationName} onChange={e => setMedicationName(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <input placeholder="Dosage (e.g. 5ml, twice daily)" value={dosage} onChange={e => setDosage(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <input type="datetime-local" value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <textarea placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                  style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
                <ActionButton onClick={submitSchedule} loading={saving} loadingLabel="Saving…" fullWidth>Schedule</ActionButton>
              </div>
            )}
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </RolePageWrapper>
  )
}
