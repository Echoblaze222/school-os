'use client'
// src/components/live/RecordingsLibrary.tsx
//
// Shared between the teacher and student recordings pages — the list of
// recordings a given user can see is entirely determined server-side by
// /api/live/recordings (via recordingsScopeFor in authorize.ts), so this
// component doesn't need to know or care which role is viewing it. What
// a teacher sees vs a student sees is a backend decision, not a frontend
// one — this just renders whatever the API returns.

import { useEffect, useState } from 'react'
import styles from './live-room.module.css'

interface Recording {
  id: string
  title: string
  className: string | null
  durationSeconds: number | null
  sizeBytes: number | null
  recordedAt: string
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '—'
  const mb = bytes / (1024 * 1024)
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(0)} MB`
}

export default function RecordingsLibrary() {
  const [recordings, setRecordings] = useState<Recording[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [playing, setPlaying] = useState<{ id: string; title: string; url: string } | null>(null)
  const [playError, setPlayError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await fetch('/api/live/recordings')
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not load recordings.')
        if (!cancelled) setRecordings(data.recordings ?? [])
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  async function play(recording: Recording) {
    setLoadingId(recording.id)
    setPlayError(null)
    try {
      const res = await fetch(`/api/live/recording/${recording.id}/url`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not open this recording.')
      setPlaying({ id: recording.id, title: recording.title, url: data.url })
    } catch (err) {
      setPlayError((err as Error).message)
    } finally {
      setLoadingId(null)
    }
  }

  if (loading) return <div className={styles.centerState}>Loading recordings…</div>
  if (error) return <div className={styles.errorState}><p className={styles.errorTitle}>{error}</p></div>

  return (
    <div className={styles.recPage}>
      <h2 className={styles.recHeading}>Recorded Classes</h2>

      {recordings.length === 0 && (
        <p className={styles.recEmpty}>No recordings yet.</p>
      )}

      <ul className={styles.recList}>
        {recordings.map(r => (
          <li key={r.id} className={styles.recItem}>
            <div>
              <p className={styles.recTitle}>{r.title}</p>
              <p className={styles.recMeta}>
                {r.className ? `${r.className} · ` : ''}
                {new Date(r.recordedAt).toLocaleDateString()} · {formatDuration(r.durationSeconds)} · {formatSize(r.sizeBytes)}
              </p>
            </div>
            <button
              onClick={() => play(r)}
              disabled={loadingId === r.id}
              className={styles.playBtn}
            >
              {loadingId === r.id ? 'Opening…' : '▶ Play'}
            </button>
          </li>
        ))}
      </ul>

      {playError && <p className={styles.recError}>{playError}</p>}

      {playing && (
        <div
          className={styles.modalOverlay}
          onClick={() => setPlaying(null)}
        >
          <div className={styles.modalCard} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <p className={styles.modalTitle}>{playing.title}</p>
              <button onClick={() => setPlaying(null)} className={styles.modalCloseBtn}>Close ✕</button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- recordings have no separate caption track yet */}
            <video src={playing.url} controls autoPlay className={styles.modalVideo} />
            <p className={styles.modalHint}>
              This link expires shortly — reopen from the list if it stops working.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
