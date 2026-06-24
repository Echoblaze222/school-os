'use client'
// src/components/ReminderButton.tsx
// Reusable "Set Reminder" button for timetable periods and live classes.
// Usage:
//   <ReminderButton
//     sourceType="timetable"          // or "live_class"
//     sourceId={period.id}
//     eventTime="2026-06-25T08:00:00" // ISO string of when the event starts
//     title="Biology"                  // notification title
//     body="Your Biology class starts in {n} minutes" // {n} replaced with minutes
//     url="/dashboard/teacher/timetable"
//     color={schoolColor}
//   />

import { useState, useEffect } from 'react'

interface Props {
  sourceType: 'timetable' | 'live_class'
  sourceId:   string
  eventTime:  string        // ISO datetime of when the event starts
  title:      string
  body:       string        // use {n} as placeholder for minutes
  url:        string
  color?:     string
  size?:      'sm' | 'md'
}

export default function ReminderButton({
  sourceType, sourceId, eventTime, title, body, url,
  color = '#7C3AED', size = 'sm',
}: Props) {
  const [existing,   setExisting]   = useState<string | null>(null) // existing fire_at ISO
  const [showPicker, setShowPicker] = useState(false)
  const [minutes,    setMinutes]    = useState('10')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState<string | null>(null)
  const [success,    setSuccess]    = useState(false)

  useEffect(() => { checkExisting() }, [sourceId])

  async function checkExisting() {
    try {
      const res = await fetch(`/api/push/remind?source_ids=${sourceId}`)
      const { reminders } = await res.json()
      const found = reminders?.find((r: any) => r.source_id === sourceId)
      setExisting(found?.fire_at ?? null)
    } catch {}
  }

  function computeFireAt(mins: number): string {
    const eventDate = new Date(eventTime)
    return new Date(eventDate.getTime() - mins * 60_000).toISOString()
  }

  function minutesUntilEvent(): number {
    return Math.floor((new Date(eventTime).getTime() - Date.now()) / 60_000)
  }

  async function save() {
    const mins = parseInt(minutes, 10)
    if (isNaN(mins) || mins < 1) { setError('Enter a valid number of minutes'); return }

    const minsUntil = minutesUntilEvent()
    if (mins >= minsUntil) {
      setError(`Event is only ${minsUntil} min away. Set a smaller reminder.`)
      return
    }

    setSaving(true)
    setError(null)

    const fire_at    = computeFireAt(mins)
    const notifBody  = body.replace('{n}', String(mins))

    try {
      const res = await fetch('/api/push/remind', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source_type: sourceType, source_id: sourceId, fire_at, title, body: notifBody, url }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      setExisting(fire_at)
      setShowPicker(false)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function remove() {
    setSaving(true)
    try {
      await fetch('/api/push/remind', {
        method:  'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ source_id: sourceId }),
      })
      setExisting(null)
    } catch {} finally {
      setSaving(false)
    }
  }

  const isSet  = !!existing
  const isSm   = size === 'sm'
  const btnPad = isSm ? '5px 11px' : '7px 16px'
  const btnFnt = isSm ? '0.7rem'   : '0.78rem'

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>

      {/* Main button */}
      <button
        onClick={() => isSet ? remove() : setShowPicker(p => !p)}
        disabled={saving}
        title={isSet ? `Reminder set for ${new Date(existing!).toLocaleTimeString('en-NG', { hour: '2-digit', minute: '2-digit' })}` : 'Set reminder'}
        style={{
          display:      'inline-flex',
          alignItems:   'center',
          gap:          5,
          padding:      btnPad,
          borderRadius: 999,
          fontSize:     btnFnt,
          fontWeight:   700,
          cursor:       saving ? 'default' : 'pointer',
          border:       `1px solid ${isSet ? color : 'var(--glass-border)'}`,
          background:   isSet ? color + '20' : 'var(--glass-bg)',
          color:        isSet ? color : 'var(--text-muted)',
          transition:   'all 0.15s',
          opacity:      saving ? 0.6 : 1,
        }}>
        {success ? '✅ Set!' : isSet ? `🔔 ${minsBeforeLabel(existing!, eventTime)}` : '🔔 Remind me'}
      </button>

      {/* Minute picker popover */}
      {showPicker && !isSet && (
        <div style={{
          position:   'absolute',
          bottom:     'calc(100% + 8px)',
          left:       0,
          zIndex:     50,
          background: 'var(--glass-bg)',
          border:     '1px solid var(--glass-border)',
          borderRadius: 12,
          padding:    '12px 14px',
          width:      210,
          boxShadow:  '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          <p style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
            Remind me before (minutes)
          </p>

          {/* Quick picks */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
            {['5', '10', '15', '30'].map(m => (
              <button key={m} onClick={() => setMinutes(m)}
                style={{
                  padding:      '4px 10px',
                  borderRadius: 999,
                  fontSize:     '0.7rem',
                  fontWeight:   700,
                  cursor:       'pointer',
                  border:       `1px solid ${minutes === m ? color : 'var(--glass-border)'}`,
                  background:   minutes === m ? color + '20' : 'transparent',
                  color:        minutes === m ? color : 'var(--text-muted)',
                }}>
                {m}m
              </button>
            ))}
          </div>

          {/* Custom input */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="number"
              min={1}
              max={1440}
              value={minutes}
              onChange={e => setMinutes(e.target.value)}
              style={{
                flex:         1,
                height:       34,
                padding:      '0 10px',
                background:   'var(--input-bg)',
                border:       '1px solid var(--input-border)',
                borderRadius: 8,
                color:        'var(--text-primary)',
                fontSize:     '0.85rem',
                outline:      'none',
              }} />
            <button onClick={save} disabled={saving}
              style={{
                height:       34,
                padding:      '0 14px',
                background:   color,
                color:        '#fff',
                border:       'none',
                borderRadius: 8,
                fontWeight:   700,
                fontSize:     '0.78rem',
                cursor:       'pointer',
                opacity:      saving ? 0.6 : 1,
              }}>
              {saving ? '...' : 'Set'}
            </button>
          </div>

          {error && (
            <p style={{ fontSize: '0.68rem', color: '#EF4444', marginTop: 6 }}>⚠️ {error}</p>
          )}

          <button onClick={() => { setShowPicker(false); setError(null) }}
            style={{ marginTop: 8, fontSize: '0.65rem', color: 'var(--text-faint)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}

// Helper: show "10m before" from fire_at and event time
function minsBeforeLabel(fireAt: string, eventTime: string): string {
  const mins = Math.round((new Date(eventTime).getTime() - new Date(fireAt).getTime()) / 60_000)
  if (mins < 60) return `${mins}m before`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m before` : `${h}h before`
}
