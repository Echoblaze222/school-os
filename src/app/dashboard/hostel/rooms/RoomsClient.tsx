'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, AlertCircleIcon, CheckCircleIcon } from '@/components/Icons'
import styles from './rooms.module.css'
import motion from '@/components/dashboard-motion.module.css'

interface Bed {
  id: string; label: string; status: 'available' | 'occupied' | 'maintenance'
  hostel_bed_assignments: Array<{ id: string; student_id: string; status: string; profiles: { id: string; full_name: string } | null }>
}
interface Room { id: string; name: string; capacity: number; status: string; hostel_beds: Bed[] }
interface Block { id: string; name: string; hostel_rooms: Room[] }
interface HostelRow { id: string; name: string; gender: string | null; hostel_blocks: Block[] }

interface Student { id: string; full_name: string }

export default function RoomsClient() {
  const [hostels, setHostels] = useState<HostelRow[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [busyBedId, setBusyBedId] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  // Assignment picker state: closes the gap flagged in Lane E1: the API
  // existed with no picker UI to call it from.
  const [pickerBedId, setPickerBedId] = useState<string | null>(null)
  const [pickerQuery, setPickerQuery] = useState('')
  const [pickerStudents, setPickerStudents] = useState<Student[]>([])
  const [pickerStatus, setPickerStatus] = useState<'idle' | 'loading' | 'error'>('idle')

  async function load() {
    setStatus('loading')
    try {
      const res = await fetch('/api/hostel/rooms')
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setHostels(data.hostels ?? [])
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  useEffect(() => { load() }, [])

  async function vacate(bedId: string) {
    if (busyBedId) return // duplicate-action protection
    setBusyBedId(bedId)
    setActionError(null)
    try {
      const res = await fetch('/api/hostel/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'vacate', bedId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not vacate the bed.')
      } else {
        await load()
      }
    } catch {
      setActionError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusyBedId(null)
    }
  }

  async function searchUnassigned(query: string) {
    setPickerStatus('loading')
    try {
      const res = await fetch(`/api/hostel/unassigned-students?q=${encodeURIComponent(query)}`)
      if (!res.ok) throw new Error('failed')
      const data = await res.json()
      setPickerStudents(data.students ?? [])
      setPickerStatus('idle')
    } catch {
      setPickerStatus('error')
    }
  }

  function openPicker(bedId: string) {
    setPickerBedId(bedId)
    setPickerQuery('')
    setPickerStudents([])
    searchUnassigned('')
  }

  async function assign(studentId: string) {
    if (!pickerBedId || busyBedId) return
    const bedId = pickerBedId
    setBusyBedId(bedId)
    setActionError(null)
    try {
      const res = await fetch('/api/hostel/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assign', bedId, studentId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setActionError(data.error ?? 'Could not assign this student.')
      } else {
        setPickerBedId(null)
        await load()
      }
    } catch {
      setActionError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusyBedId(null)
    }
  }

  return (
    <main className={styles.main}>
      <div className={styles.topBar}>
        <Link href="/dashboard/hostel" className={styles.backLink}>
          <ArrowLeftIcon size={18} /> Back to hostel dashboard
        </Link>
      </div>
      <h1 className={styles.title}>Rooms & beds</h1>

      {status === 'loading' && (
        <div className={`glass-card ${styles.loadingCard}`}>
          <span className={motion.shimmer}>Loading room structure...</span>
        </div>
      )}

      {status === 'error' && (
        <div className={`glass-card ${styles.errorCard}`}>
          <AlertCircleIcon size={20} />
          <p>Couldn't load rooms. Check your connection and try again.</p>
          <button className="btn btn-secondary btn-sm" onClick={load}>Try again</button>
        </div>
      )}

      {actionError && (
        <div className={`glass-card ${styles.errorCard}`}>
          <AlertCircleIcon size={20} />
          <p>{actionError}</p>
        </div>
      )}

      {status === 'ready' && hostels.length === 0 && (
        <div className="glass-card" style={{ padding: 16 }}>
          <p>No hostels set up yet.</p>
        </div>
      )}

      {status === 'ready' && hostels.map(hostel => (
        <section key={hostel.id} className={styles.hostelSection}>
          <h2 className={styles.hostelName}>{hostel.name}</h2>
          {hostel.hostel_blocks.length === 0 && (
            <p className={styles.emptyNote}>No blocks added to this hostel yet.</p>
          )}
          {hostel.hostel_blocks.map(block => (
            <div key={block.id} className={styles.block}>
              <h3 className={styles.blockName}>{block.name}</h3>
              <div className={styles.roomGrid}>
                {block.hostel_rooms.map(room => (
                  <div key={room.id} className="glass-card-flat" style={{ padding: 12, borderRadius: 'var(--radius-lg)' }}>
                    <div className={styles.roomHeader}>
                      <span>{room.name}</span>
                      <span className={styles.roomCapacity}>
                        {room.hostel_beds.filter(b => b.status === 'occupied').length}/{room.capacity}
                      </span>
                    </div>
                    <div className={styles.bedList}>
                      {room.hostel_beds.map(bed => {
                        const activeAssignment = bed.hostel_bed_assignments?.find(a => a.status === 'active')
                        return (
                          <div key={bed.id} className={styles.bedRow}>
                            <span className={`${styles.bedDot} ${bed.status === 'occupied' ? styles.bedDotOccupied : styles.bedDotAvailable}`} />
                            <span className={styles.bedLabel}>{bed.label}</span>
                            {activeAssignment ? (
                              <>
                                <span className={styles.bedStudent}>{activeAssignment.profiles?.full_name ?? 'Assigned'}</span>
                                <button
                                  className="btn btn-secondary btn-sm"
                                  disabled={busyBedId === bed.id}
                                  onClick={() => vacate(bed.id)}
                                >
                                  {busyBedId === bed.id ? 'Vacating...' : 'Vacate'}
                                </button>
                              </>
                            ) : (
                              <>
                                <span className={styles.bedVacant}>Vacant</span>
                                <button
                                  className="btn btn-primary btn-sm"
                                  disabled={busyBedId === bed.id}
                                  onClick={() => openPicker(bed.id)}
                                >
                                  Assign
                                </button>
                              </>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}

      {pickerBedId && (
        <div className={styles.pickerOverlay} onClick={() => !busyBedId && setPickerBedId(null)}>
          <div className={styles.pickerModal} onClick={e => e.stopPropagation()}>
            <h3 className={styles.pickerTitle}>Assign a student</h3>
            <input
              className={styles.pickerInput}
              autoFocus
              placeholder="Search by name..."
              value={pickerQuery}
              onChange={e => { setPickerQuery(e.target.value); searchUnassigned(e.target.value) }}
            />
            {pickerStatus === 'loading' && (
              <p className={styles.pickerHint}><span className={motion.shimmer}>Searching...</span></p>
            )}
            {pickerStatus === 'error' && (
              <p className={styles.pickerHint}>Couldn't search students. Try again.</p>
            )}
            {pickerStatus === 'idle' && pickerStudents.length === 0 && (
              <p className={styles.pickerHint}>No unassigned students match that search.</p>
            )}
            <div className={styles.pickerList}>
              {pickerStudents.map(s => (
                <button
                  key={s.id}
                  className={styles.pickerRow}
                  disabled={!!busyBedId}
                  onClick={() => assign(s.id)}
                >
                  {s.full_name}
                  {busyBedId === pickerBedId && <span className={motion.shimmer}>Assigning...</span>}
                </button>
              ))}
            </div>
            <button className="btn btn-secondary btn-sm" style={{ marginTop: 8 }}
              disabled={!!busyBedId} onClick={() => setPickerBedId(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </main>
  )
}
