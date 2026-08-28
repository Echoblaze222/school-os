'use client'

import { useEffect, useState } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { ClipboardIcon, SearchIcon, XIcon, UserIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/motion/Skeleton'
import EmptyState from '@/components/motion/EmptyState'
import ActionButton from '@/components/motion/ActionButton'
import { Toast, useToast } from '@/components/motion/Toast'
import styles from '../nurse.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Props { profile: any; school: any; userId: string }

function truncate(s: string, n: number) { return s.length > n ? s.slice(0, n) + '…' : s }

export default function HealthRecordsClient({ profile, school, userId }: Props) {
  const { toast, showToast } = useToast()
  const [records, setRecords] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<any | null>(null)
  const [saving, setSaving] = useState(false)

  const [bloodGroup, setBloodGroup] = useState('')
  const [allergies, setAllergies] = useState('')
  const [chronicConditions, setChronicConditions] = useState('')
  const [currentMedications, setCurrentMedications] = useState('')
  const [emergencyContactName, setEmergencyContactName] = useState('')
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('')
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState('')
  const [physicianName, setPhysicianName] = useState('')
  const [physicianPhone, setPhysicianPhone] = useState('')
  const [notes, setNotes] = useState('')

  async function loadRecords(q?: string) {
    setLoading(true)
    try {
      const res = await fetch(`/api/nurse/health-records${q ? `?search=${encodeURIComponent(q)}` : ''}`)
      const json = await res.json()
      setRecords(json.ok ? json.records : [])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadRecords() }, [])
  useEffect(() => {
    const t = setTimeout(() => loadRecords(search), 300)
    return () => clearTimeout(t)
  }, [search])

  function openRecord(r: any) {
    setSelected(r)
    const hp = r.healthProfile
    setBloodGroup(hp?.blood_group ?? '')
    setAllergies(hp?.allergies ?? '')
    setChronicConditions(hp?.chronic_conditions ?? '')
    setCurrentMedications(hp?.current_medications ?? '')
    setEmergencyContactName(hp?.emergency_contact_name ?? '')
    setEmergencyContactPhone(hp?.emergency_contact_phone ?? '')
    setEmergencyContactRelationship(hp?.emergency_contact_relationship ?? '')
    setPhysicianName(hp?.physician_name ?? '')
    setPhysicianPhone(hp?.physician_phone ?? '')
    setNotes(hp?.notes ?? '')
  }

  async function saveRecord() {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch('/api/nurse/health-records', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: selected.student.id, bloodGroup,
          allergies, chronicConditions: chronicConditions, currentMedications: currentMedications,
          emergencyContactName, emergencyContactPhone, emergencyContactRelationship, physicianName, physicianPhone, notes,
        }),
      })
      const json = await res.json()
      if (!json.ok) { showToast(json.error ?? 'Could not save.'); return }
      showToast('Health record saved.')
      setSelected(null); loadRecords(search)
    } finally { setSaving(false) }
  }

  return (
    <RolePageWrapper userId={userId} role="nurse" profile={profile} school={school} title="Health Records">
      <main className={styles.main}>
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <span style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }}><SearchIcon size={14} /></span>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search students by name"
            style={{ width: '100%', padding: '10px 12px 10px 32px', borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }}
          />
        </div>

        {loading ? <SkeletonList count={5} variant="row" /> : records.length === 0 ? (
          <EmptyState icon={<ClipboardIcon size={28} />} title="No students found" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {records.map((r: any) => {
              const hasFlags = !!(r.healthProfile?.allergies?.trim()) || !!(r.healthProfile?.chronic_conditions?.trim())
              return (
                <button key={r.student.id} onClick={() => openRecord(r)}
                  className={`glass-card ${motion.pressable}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, borderRadius: 'var(--radius-lg)', border: 'none', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 999, background: 'var(--brand-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <UserIcon size={16} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontWeight: 700, fontSize: '0.84rem', margin: 0 }}>{r.student.full_name}</p>
                    <p style={{ fontSize: '0.74rem', color: hasFlags ? 'var(--status-warn, #E4572E)' : 'var(--text-muted)', margin: '2px 0 0' }}>
                      {hasFlags
                        ? truncate([r.healthProfile?.allergies, r.healthProfile?.chronic_conditions].filter(Boolean).join(' · '), 60)
                        : r.healthProfile ? 'No flags on file' : 'No health record yet'}
                    </p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
        <div style={{ height: 100 }} />
      </main>

      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end', zIndex: 100 }}>
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '100%', maxHeight: '88vh', overflowY: 'auto', padding: 20, borderRadius: '20px 20px 0 0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <p style={{ fontWeight: 800, fontSize: '1rem', margin: 0 }}>{selected.student.full_name}</p>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><XIcon size={18} /></button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input placeholder="Blood group" value={bloodGroup} onChange={e => setBloodGroup(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Allergies (comma separated)" value={allergies} onChange={e => setAllergies(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Chronic conditions (comma separated)" value={chronicConditions} onChange={e => setChronicConditions(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Current medications (comma separated)" value={currentMedications} onChange={e => setCurrentMedications(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Emergency contact name" value={emergencyContactName} onChange={e => setEmergencyContactName(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Emergency contact phone" value={emergencyContactPhone} onChange={e => setEmergencyContactPhone(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Relationship to student (e.g. Mother)" value={emergencyContactRelationship} onChange={e => setEmergencyContactRelationship(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Physician name" value={physicianName} onChange={e => setPhysicianName(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <input placeholder="Physician phone" value={physicianPhone} onChange={e => setPhysicianPhone(e.target.value)}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <textarea placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                style={{ padding: 10, borderRadius: 10, border: '1px solid var(--input-border)', background: 'var(--input-bg)' }} />
              <ActionButton onClick={saveRecord} loading={saving} loadingLabel="Saving…" fullWidth>Save Record</ActionButton>
            </div>
          </div>
        </div>
      )}

      <Toast toast={toast} />
    </RolePageWrapper>
  )
}
