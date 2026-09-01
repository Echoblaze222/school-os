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

  if (loading) return <div className="p-6 text-center text-gray-500">Loading recordings…</div>
  if (error) return <div className="p-6 text-center text-red-600">{error}</div>

  return (
    <div className="p-4">
      <h2 className="text-lg font-semibold mb-4">Recorded Classes</h2>

      {recordings.length === 0 && (
        <p className="text-gray-400 text-sm">No recordings yet.</p>
      )}

      <ul className="divide-y">
        {recordings.map(r => (
          <li key={r.id} className="py-3 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">{r.title}</p>
              <p className="text-xs text-gray-500">
                {r.className ? `${r.className} · ` : ''}
                {new Date(r.recordedAt).toLocaleDateString()} · {formatDuration(r.durationSeconds)} · {formatSize(r.sizeBytes)}
              </p>
            </div>
            <button
              onClick={() => play(r)}
              disabled={loadingId === r.id}
              className="px-3 py-1 rounded bg-blue-600 text-white text-sm disabled:opacity-50 shrink-0"
            >
              {loadingId === r.id ? 'Opening…' : '▶ Play'}
            </button>
          </li>
        ))}
      </ul>

      {playError && <p className="text-red-600 text-sm mt-3">{playError}</p>}

      {playing && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setPlaying(null)}
        >
          <div className="bg-white rounded-lg p-3 max-w-3xl w-full" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <p className="font-medium text-sm">{playing.title}</p>
              <button onClick={() => setPlaying(null)} className="text-gray-500 text-sm">Close ✕</button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption -- recordings have no separate caption track yet */}
            <video src={playing.url} controls autoPlay className="w-full rounded" />
            <p className="text-xs text-gray-400 mt-2">
              This link expires shortly — reopen from the list if it stops working.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
