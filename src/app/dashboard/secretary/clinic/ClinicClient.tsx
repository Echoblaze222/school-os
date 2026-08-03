'use client'
// src/app/dashboard/secretary/clinic/ClinicClient.tsx

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import styles from '../secretary.module.css'

interface StudentOpt { id: string; full_name: string; default_code: string | null }
interface Visit {
  id: string; student_id: string; visited_at: string; reason: string; symptoms: string | null
  treatment_given: string | null; temperature_c: number | null; sent_home: boolean
  parent_notified: boolean
  profiles: { full_name: string; default_code: string | null } | null
}
interface MedRecord {
  id: string; student_id: string; blood_group: string | null; allergies: string | null
  chronic_conditions: string | null; current_medications: string | null
  emergency_contact_name: string | null; emergency_contact_phone: string | null
  emergency_contact_relationship: string | null; notes: string | null
  profiles: { full_name: string; default_code: string | null } | null
}
interface Props { visits: Visit[]; records: MedRecord[]; students: StudentOpt[]; profile: any; school: any; userId: string }

const emptyRecordForm = {
  blood_group: '', allergies: '', chronic_conditions: '', current_medications: '',
  emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '', notes: '',
}
const emptyVisitForm = {
  student_id: '', reason: '', symptoms: '', treatment_given: '', temperature_c: '', sent_home: false, parent_notified: false,
}

export default function ClinicClient({ visits: initVisits, records: initRecords, students, profile, school, userId }: Props) {
  const [tab,     setTab]     = useState<'visits' | 'records'>('visits')
  const [visits,  setVisits]  = useState(initVisits)
  const [records, setRecords] = useState(initRecords)
  const [search,  setSearch]  = useState('')

  const [visitModal,  setVisitModal]  = useState(false)
  const [recordModal, setRecordModal] = useState<StudentOpt | null>(null)
  const [saving,      setSaving]      = useState(false)
  const [msg,         setMsg]         = useState('')

  const [visitForm,  setVisitForm]  = useState(emptyVisitForm)
  const [recordForm, setRecordForm] = useState(emptyRecordForm)
  const [visitSearch, setVisitSearch] = useState('')

  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  const recordByStudent = new Map(records.map(r => [r.student_id, r]))
  const filteredStudents = students.filter(s => s.full_name.toLowerCase().includes(search.toLowerCase()))

  // Search by name OR access code — lets the secretary find a student fast
  // even in a 500+ roster, instead of scrolling a giant dropdown.
  const visitSearchQ = visitSearch.trim().toLowerCase()
  const visitMatches = visitSearchQ
    ? students.filter(s =>
        s.full_name.toLowerCase().includes(visitSearchQ) ||
        (s.default_code ?? '').toLowerCase().includes(visitSearchQ)
      ).slice(0, 8)
    : []
  const selectedVisitStudent = students.find(s => s.id === visitForm.student_id) ?? null

  async function logVisit() {
    if (!visitForm.student_id || !visitForm.reason.trim()) { setMsg('Student and reason are required.'); return }
    setSaving(true); setMsg('')

    const { data, error } = await supabase.from('clinic_visits').insert({
      student_id: visitForm.student_id,
      reason: visitForm.reason.trim(),
      symptoms: visitForm.symptoms.trim() || null,
      treatment_given: visitForm.treatment_given.trim() || null,
      temperature_c: visitForm.temperature_c ? Number(visitForm.temperature_c) : null,
      sent_home: visitForm.sent_home,
      parent_notified: visitForm.parent_notified,
      parent_notified_at: visitForm.parent_notified ? new Date().toISOString() : null,
      school_id: school?.id,
      recorded_by: userId,
    }).select('*, profiles!clinic_visits_student_id_fkey(full_name, default_code)').single()

    if (!error && data) {
      setVisits(p => [data, ...p])
      setVisitModal(false)
      setVisitForm(emptyVisitForm)
      setVisitSearch('')
    } else {
      setMsg(error?.message ?? 'Could not log visit')
    }
    setSaving(false)
  }

  function openRecordModal(student: StudentOpt) {
    const existing = recordByStudent.get(student.id)
    setRecordForm(existing ? {
      blood_group: existing.blood_group ?? '', allergies: existing.allergies ?? '',
      chronic_conditions: existing.chronic_conditions ?? '', current_medications: existing.current_medications ?? '',
      emergency_contact_name: existing.emergency_contact_name ?? '', emergency_contact_phone: existing.emergency_contact_phone ?? '',
      emergency_contact_relationship: existing.emergency_contact_relationship ?? '', notes: existing.notes ?? '',
    } : emptyRecordForm)
    setMsg('')
    setRecordModal(student)
  }

  async function saveRecord() {
    if (!recordModal) return
    setSaving(true); setMsg('')

    const payload = {
      student_id: recordModal.id,
      school_id: school?.id,
      blood_group: recordForm.blood_group.trim() || null,
      allergies: recordForm.allergies.trim() || null,
      chronic_conditions: recordForm.chronic_conditions.trim() || null,
      current_medications: recordForm.current_medications.trim() || null,
      emergency_contact_name: recordForm.emergency_contact_name.trim() || null,
      emergency_contact_phone: recordForm.emergency_contact_phone.trim() || null,
      emergency_contact_relationship: recordForm.emergency_contact_relationship.trim() || null,
      notes: recordForm.notes.trim() || null,
      updated_by: userId,
    }

    // One row per student — upsert on the unique student_id constraint.
    const { data, error } = await supabase.from('student_medical_records')
      .upsert(payload, { onConflict: 'student_id' })
      .select('*, profiles!student_medical_records_student_id_fkey(full_name, default_code)')
      .single()

    if (!error && data) {
      setRecords(p => {
        const others = p.filter(r => r.student_id !== recordModal.id)
        return [...others, data]
      })
      setRecordModal(null)
    } else {
      setMsg(error?.message ?? 'Could not save record')
    }
    setSaving(false)
  }

  return (
    <RolePageWrapper userId={userId} role="secretary" profile={profile} school={school} title="Clinic">
      {/* Stats */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color: sc }}>{visits.length}</p>
          <p className={styles.statLbl}>Total visits</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color: '#F59E0B' }}>{visits.filter(v => v.sent_home).length}</p>
          <p className={styles.statLbl}>Sent home</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal} style={{ color: '#10B981' }}>{records.length}</p>
          <p className={styles.statLbl}>Records on file</p>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' }}>
        {(['visits', 'records'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: '8px 0', borderRadius: 'var(--radius-md)', border: '1px solid', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              background: tab === t ? sc + '22' : 'var(--glass-bg)',
              borderColor: tab === t ? sc : 'var(--glass-border)',
              color: tab === t ? sc : 'var(--text-muted)' }}>
            {t === 'visits' ? 'Visit Log' : 'Medical Records'}
          </button>
        ))}
      </div>

      {tab === 'visits' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-4)' }}>
            <button className={styles.btnPrimary} onClick={() => { setMsg(''); setVisitSearch(''); setVisitModal(true) }} style={{ height: 44, padding: '0 var(--space-4)' }}>+ Log visit</button>
          </div>

          {visits.length === 0 ? (
            <div className={styles.emptyState}><p className={styles.emptyEmoji}>🩺</p><p className={styles.emptyTitle}>No visits logged</p><p className={styles.emptyHint}>Clinic visits will show up here</p></div>
          ) : (
            visits.map(v => (
              <div key={v.id} className={styles.listItem}>
                <div className={styles.listIconBox} style={{ background: (v.sent_home ? '#F59E0B' : sc) + '22' }}>
                  <span style={{ fontSize: '1.3rem' }}>🩺</span>
                </div>
                <div className={styles.listContent}>
                  <p className={styles.listTitle}>{v.profiles?.full_name ?? 'Unknown student'}</p>
                  <p className={styles.listSub}>
                    {v.reason} · {new Date(v.visited_at).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    {v.temperature_c ? ` · ${v.temperature_c}°C` : ''}
                  </p>
                </div>
                {v.sent_home && <span className={styles.listBadge} style={{ background: '#F59E0B22', color: '#F59E0B' }}>Sent home</span>}
                {v.parent_notified && <span className={styles.listBadge} style={{ background: '#10B98122', color: '#10B981' }}>Parent notified</span>}
              </div>
            ))
          )}
        </>
      )}

      {tab === 'records' && (
        <>
          <div className={styles.searchBar} style={{ marginBottom: 'var(--space-4)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input className={styles.searchInput} placeholder="Search students…" value={search} onChange={e => setSearch(e.target.value)} />
          </div>

          {filteredStudents.length === 0 ? (
            <div className={styles.emptyState}><p className={styles.emptyEmoji}>👤</p><p className={styles.emptyTitle}>No students found</p></div>
          ) : (
            filteredStudents.map(s => {
              const rec = recordByStudent.get(s.id)
              return (
                <div key={s.id} className={styles.listItem} onClick={() => openRecordModal(s)} style={{ cursor: 'pointer' }}>
                  <div className={styles.listIconBox} style={{ background: (rec?.allergies ? '#EF4444' : sc) + '22' }}>
                    <span style={{ fontSize: '1.3rem' }}>{rec?.allergies ? '⚠️' : '👤'}</span>
                  </div>
                  <div className={styles.listContent}>
                    <p className={styles.listTitle}>{s.full_name}</p>
                    <p className={styles.listSub}>{rec ? (rec.allergies ? `Allergies: ${rec.allergies}` : 'On file — no allergies noted') : 'No medical record yet'}</p>
                  </div>
                  <span className={styles.listBadge} style={{ background: rec ? '#10B98122' : 'var(--glass-bg)', color: rec ? '#10B981' : 'var(--text-muted)', border: rec ? 'none' : '1px solid var(--glass-border)' }}>{rec ? 'On file' : 'Add'}</span>
                </div>
              )
            })
          )}
        </>
      )}

      {/* Log visit modal */}
      {visitModal && (
        <div className={styles.modalOverlay} onClick={() => setVisitModal(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <h2 className={styles.modalTitle}>Log Clinic Visit</h2>
            <div className={styles.formGroup}><label className={styles.formLabel}>Student *</label>
              {selectedVisitStudent ? (
                <div className={styles.listItem} style={{ marginBottom: 0 }}>
                  <div className={styles.listContent}>
                    <p className={styles.listTitle}>{selectedVisitStudent.full_name}</p>
                    {selectedVisitStudent.default_code && <p className={styles.listSub}>Code: {selectedVisitStudent.default_code}</p>}
                  </div>
                  <button type="button" className={styles.btnGhost} style={{ height: 32, padding: '0 var(--space-3)' }}
                    onClick={() => { setVisitForm(p => ({ ...p, student_id: '' })); setVisitSearch('') }}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className={styles.searchBar}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                    <input className={styles.searchInput} placeholder="Search by name or access code…" value={visitSearch} onChange={e => setVisitSearch(e.target.value)} autoFocus />
                  </div>
                  {visitSearchQ && (
                    visitMatches.length === 0 ? (
                      <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 'var(--space-2) 0 0' }}>No student matches "{visitSearch}"</p>
                    ) : (
                      <div style={{ maxHeight: 220, overflowY: 'auto', marginTop: 'var(--space-2)' }}>
                        {visitMatches.map(s => (
                          <div key={s.id} className={styles.listItem} style={{ cursor: 'pointer' }}
                            onClick={() => { setVisitForm(p => ({ ...p, student_id: s.id })); setVisitSearch('') }}>
                            <div className={styles.listContent}>
                              <p className={styles.listTitle}>{s.full_name}</p>
                              {s.default_code && <p className={styles.listSub}>Code: {s.default_code}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  )}
                </>
              )}
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Reason *</label><input className={styles.formInput} value={visitForm.reason} onChange={e => setVisitForm(p => ({ ...p, reason: e.target.value }))} placeholder="e.g. Headache, minor cut" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Symptoms</label><textarea className={styles.formTextarea} value={visitForm.symptoms} onChange={e => setVisitForm(p => ({ ...p, symptoms: e.target.value }))} rows={2} /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Treatment given</label><textarea className={styles.formTextarea} value={visitForm.treatment_given} onChange={e => setVisitForm(p => ({ ...p, treatment_given: e.target.value }))} rows={2} /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Temperature (°C)</label><input type="number" step="0.1" className={styles.formInput} value={visitForm.temperature_c} onChange={e => setVisitForm(p => ({ ...p, temperature_c: e.target.value }))} placeholder="Optional" /></div>
            <div style={{ display: 'flex', gap: 'var(--space-4)', marginBottom: 'var(--space-3)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={visitForm.sent_home} onChange={e => setVisitForm(p => ({ ...p, sent_home: e.target.checked }))} /> Sent home
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input type="checkbox" checked={visitForm.parent_notified} onChange={e => setVisitForm(p => ({ ...p, parent_notified: e.target.checked }))} /> Parent notified
              </label>
            </div>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setVisitModal(false)}>Cancel</button><button className={styles.btnPrimary} onClick={logVisit} disabled={saving}>{saving ? 'Saving…' : 'Log Visit'}</button></div>
          </div>
        </div>
      )}

      {/* Medical record modal */}
      {recordModal && (
        <div className={styles.modalOverlay} onClick={() => setRecordModal(null)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto' }}>
            <h2 className={styles.modalTitle}>{recordModal.full_name}'s Medical Record</h2>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className={styles.formGroup} style={{ flex: 1 }}><label className={styles.formLabel}>Blood group</label><input className={styles.formInput} value={recordForm.blood_group} onChange={e => setRecordForm(p => ({ ...p, blood_group: e.target.value }))} placeholder="e.g. O+" /></div>
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Allergies</label><textarea className={styles.formTextarea} value={recordForm.allergies} onChange={e => setRecordForm(p => ({ ...p, allergies: e.target.value }))} rows={2} placeholder="e.g. Peanuts, penicillin" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Chronic conditions</label><textarea className={styles.formTextarea} value={recordForm.chronic_conditions} onChange={e => setRecordForm(p => ({ ...p, chronic_conditions: e.target.value }))} rows={2} placeholder="e.g. Asthma" /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Current medications</label><textarea className={styles.formTextarea} value={recordForm.current_medications} onChange={e => setRecordForm(p => ({ ...p, current_medications: e.target.value }))} rows={2} /></div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Emergency contact name</label><input className={styles.formInput} value={recordForm.emergency_contact_name} onChange={e => setRecordForm(p => ({ ...p, emergency_contact_name: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
              <div className={styles.formGroup} style={{ flex: 1 }}><label className={styles.formLabel}>Contact phone</label><input className={styles.formInput} value={recordForm.emergency_contact_phone} onChange={e => setRecordForm(p => ({ ...p, emergency_contact_phone: e.target.value }))} /></div>
              <div className={styles.formGroup} style={{ flex: 1 }}><label className={styles.formLabel}>Relationship</label><input className={styles.formInput} value={recordForm.emergency_contact_relationship} onChange={e => setRecordForm(p => ({ ...p, emergency_contact_relationship: e.target.value }))} placeholder="e.g. Mother" /></div>
            </div>
            <div className={styles.formGroup}><label className={styles.formLabel}>Notes</label><textarea className={styles.formTextarea} value={recordForm.notes} onChange={e => setRecordForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
            {msg && <p style={{ fontSize: '0.78rem', color: '#EF4444', margin: '0 0 var(--space-3)' }}>{msg}</p>}
            <div className={styles.modalActions}><button className={styles.btnGhost} onClick={() => setRecordModal(null)}>Cancel</button><button className={styles.btnPrimary} onClick={saveRecord} disabled={saving}>{saving ? 'Saving…' : 'Save Record'}</button></div>
          </div>
        </div>
      )}

      <div style={{ height: 110 }} />
    </RolePageWrapper>
  )
}
