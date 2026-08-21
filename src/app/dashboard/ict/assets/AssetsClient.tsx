'use client'
// src/app/dashboard/ict/assets/AssetsClient.tsx

import { useState } from 'react'
import Link from 'next/link'
import styles from './assets.module.css'

const STATUS_COLOR: Record<string, string> = {
  in_use: '#3FA66B', in_storage: '#4A90D9', under_repair: '#E4572E', retired: '#7A7A88', lost: '#D64545',
}
const STATUS_LABEL: Record<string, string> = {
  in_use: 'In Use', in_storage: 'In Storage', under_repair: 'Under Repair', retired: 'Retired', lost: 'Lost',
}
const DEVICE_TYPES = ['computer', 'laptop', 'tablet', 'printer', 'scanner', 'projector', 'smart_board', 'router', 'access_point', 'other']

interface Asset {
  id: string; asset_tag: string; device_type: string; name: string
  serial_number: string | null; location: string | null
  status: string; condition: string; assigned_to_dept: string | null
}

export default function AssetsClient({
  initialAssets, schoolColor,
}: { initialAssets: Asset[]; schoolColor: string }) {
  const [assets, setAssets] = useState(initialAssets)
  const [filter, setFilter] = useState<'all' | string>('all')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [errorId, setErrorId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const filtered = filter === 'all' ? assets : assets.filter(a => a.status === filter)

  async function updateStatus(id: string, status: string) {
    setSavingId(id); setErrorId(null)
    const prev = assets
    setAssets(list => list.map(a => a.id === id ? { ...a, status } : a)) // optimistic
    try {
      const res = await fetch(`/api/ict/assets/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setAssets(prev) // roll back on failure, never leave the UI claiming a save that didn't happen
      setErrorId(id)
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg-base)' }}>
      <div className={styles.pageHeader}>
        <Link href="/dashboard/ict" className={styles.backBtn}>←</Link>
        <p className={styles.pageTitle}>Assets & Devices</p>
        <button className={styles.addBtn} style={{ background: schoolColor }} onClick={() => setShowAdd(true)}>+</button>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.tabs}>
          {['all', ...Object.keys(STATUS_LABEL)].map(f => (
            <button key={f} className={`${styles.tab} ${filter === f ? styles.tabActive : ''}`}
              style={filter === f ? { background: schoolColor } : undefined}
              onClick={() => setFilter(f)}>
              {f === 'all' ? 'All' : STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className={styles.emptyState}>No assets in this view yet.</div>
        ) : filtered.map(a => (
          <div key={a.id} className={styles.card}>
            <div className={styles.cardTop}>
              <div>
                <p className={styles.cardName}>{a.name}</p>
                <p className={styles.cardTag}>{a.asset_tag}</p>
                <p className={styles.cardMeta}>
                  {a.device_type.replace('_', ' ')}
                  {a.location ? ` · ${a.location}` : ''}
                  {a.assigned_to_dept ? ` · ${a.assigned_to_dept}` : ''}
                </p>
              </div>
              <span className={styles.badge} style={{ background: STATUS_COLOR[a.status] }}>
                {STATUS_LABEL[a.status]}
              </span>
            </div>

            <div className={styles.actions}>
              <select
                className={styles.select}
                value={a.status}
                disabled={savingId === a.id}
                onChange={e => updateStatus(a.id, e.target.value)}
              >
                {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>

            {errorId === a.id && (
              <p className={styles.errorText}>Couldn&apos;t save that change, check your connection and try again.</p>
            )}
          </div>
        ))}
      </div>

      {showAdd && (
        <AddAssetModal
          schoolColor={schoolColor}
          onClose={() => setShowAdd(false)}
          onCreated={(asset) => { setAssets(list => [asset, ...list]); setShowAdd(false) }}
        />
      )}
    </div>
  )
}

function AddAssetModal({
  schoolColor, onClose, onCreated,
}: { schoolColor: string; onClose: () => void; onCreated: (a: Asset) => void }) {
  const [form, setForm] = useState({ assetTag: '', deviceType: 'computer', name: '', location: '', serialNumber: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.assetTag || !form.name) return setError('Asset tag and name are required.')
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/ict/assets', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Could not create asset.')
      onCreated({
        id: json.assetId, asset_tag: form.assetTag, device_type: form.deviceType, name: form.name,
        serial_number: form.serialNumber || null, location: form.location || null,
        status: 'in_use', condition: 'good', assigned_to_dept: null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create asset.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <p className={styles.modalTitle}>Add asset</p>
        <form onSubmit={submit}>
          <div className={styles.field}>
            <label className={styles.label}>Asset tag</label>
            <input className={styles.input} placeholder="e.g. PC-SS2-014" value={form.assetTag}
              onChange={e => setForm(f => ({ ...f, assetTag: e.target.value }))} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input className={styles.input} placeholder="e.g. SS2 Lab PC 14" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Device type</label>
            <select className={styles.modalSelect} value={form.deviceType}
              onChange={e => setForm(f => ({ ...f, deviceType: e.target.value }))}>
              {DEVICE_TYPES.map(t => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Location</label>
            <input className={styles.input} placeholder="e.g. Computer Lab" value={form.location}
              onChange={e => setForm(f => ({ ...f, location: e.target.value }))} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Serial number (optional)</label>
            <input className={styles.input} value={form.serialNumber}
              onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
          </div>

          {error && <p className={styles.errorText}>{error}</p>}

          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>Cancel</button>
            <button type="submit" className={styles.submitBtn} style={{ background: schoolColor }} disabled={submitting}>
              {submitting ? 'Adding…' : 'Add asset'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
