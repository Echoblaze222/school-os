// src/components/org/HostelPicker.tsx
//
// Replaces the plain "No hostels exist yet." dead end that appeared in
// StaffClient.tsx, CodesClient.tsx, and LeadershipClient.tsx (6 render
// sites across all three) - nothing in this codebase could ever create
// a hostel before api/org/hostels' POST handler was added alongside
// this component, so a principal appointing a warden/house-parent/etc
// for the first time had no way to satisfy "select at least one hostel"
// at all.
//
// Deliberately a plain checkbox list + inline add row, not a full
// hostel-management page - creating one here is meant to unblock this
// specific flow, not replace whatever fuller hostel admin surface this
// app may eventually want.

'use client'

import { useState } from 'react'

export interface HostelOption { id: string; name: string }

export function HostelPicker({
  hostels,
  selectedIds,
  onToggle,
  onCreated,
  accentColor = 'var(--accent, #2D8B55)',
}: {
  hostels: HostelOption[]
  selectedIds: string[]
  onToggle: (id: string) => void
  onCreated: (hostel: HostelOption) => void
  accentColor?: string
}) {
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/org/hostels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      })
      const json = await res.json()
      if (!json.ok) {
        setError(json.error ?? 'Failed to add hostel.')
        return
      }
      onCreated(json.hostel)
      onToggle(json.hostel.id) // auto-select the one just created
      setName('')
      setAdding(false)
    } catch {
      setError('Failed to add hostel.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      {hostels.length === 0 && !adding && (
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          No hostels exist yet.{' '}
          <button
            type="button"
            onClick={() => setAdding(true)}
            style={{ color: accentColor, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Add one
          </button>
        </p>
      )}

      {hostels.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '30vh', overflowY: 'auto' }}>
          {hostels.map(h => (
            <label key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem' }}>
              <input type="checkbox" checked={selectedIds.includes(h.id)} onChange={() => onToggle(h.id)} />
              {h.name}
            </label>
          ))}
        </div>
      )}

      {hostels.length > 0 && !adding && (
        <button
          type="button"
          onClick={() => setAdding(true)}
          style={{ marginTop: 6, fontSize: '0.76rem', color: accentColor, background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
        >
          + Add another hostel
        </button>
      )}

      {adding && (
        <div style={{ display: 'flex', gap: 6, marginTop: hostels.length > 0 ? 8 : 4, alignItems: 'center' }}>
          <input
            autoFocus
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAdd() }}
            placeholder="Hostel name"
            style={{ flex: 1, fontSize: '0.82rem', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border, #333)', background: 'var(--surface, #111)', color: 'inherit' }}
          />
          <button type="button" onClick={handleAdd} disabled={saving || !name.trim()} style={{ fontSize: '0.78rem', color: accentColor, background: 'none', border: 'none', cursor: 'pointer' }}>
            {saving ? 'Adding…' : 'Add'}
          </button>
          <button type="button" onClick={() => { setAdding(false); setName(''); setError(null) }} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
            Cancel
          </button>
        </div>
      )}

      {error && <p style={{ fontSize: '0.76rem', color: '#EF4444', margin: '4px 0 0' }}>{error}</p>}
    </div>
  )
}
