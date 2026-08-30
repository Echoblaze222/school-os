'use client'
// src/app/dashboard/principal/certificates/CertificatesClient.tsx
//
// Kept intentionally compact for a first pass: settings, a graduating-
// year picker, bulk generate (with per-student eligibility reasons
// surfaced, never a silent skip), and a list with Approve/Revoke.
// Bulk template customization (§58) and richer preview (§60/61) are
// follow-ups, not attempted here — see the delivery notes.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import {
  GraduationCapIcon, SettingsIcon, UploadIcon, CheckCircleIcon, AlertIcon,
  XIcon, FileTextIcon, RefreshIcon,
} from '@/components/Icons'
import type { GraduatedStudent } from './page'

interface Props { graduatedStudents: GraduatedStudent[]; school: any; profile: any; userId: string }

interface CertRow {
  id: string; certificate_number: string; status: string
  graduation_year: number; final_class: string | null
  issue_date: string | null; pdf_url: string | null; public_token: string
  revoked_at: string | null; revoked_reason: string | null
  student: { id: string; full_name: string; avatar_url: string | null } | null
}

export default function CertificatesClient({ graduatedStudents, school, profile, userId }: Props) {
  const sc = school?.primary_color ?? '#7C3AED'
  const years = Array.from(new Set(graduatedStudents.map(s => s.graduation_year).filter(Boolean))) as number[]

  const [year, setYear] = useState<number | null>(years[0] ?? new Date().getFullYear())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [eligibility, setEligibility] = useState<Record<string, { eligible: boolean; reasons: string[] }>>({})
  const [checking, setChecking] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [certs, setCerts] = useState<CertRow[]>([])
  const [loadingCerts, setLoadingCerts] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  const studentsForYear = graduatedStudents.filter(s => s.graduation_year === year)

  useEffect(() => { loadCerts() }, [])

  async function loadCerts() {
    setLoadingCerts(true)
    try {
      const res = await fetch('/api/examination/certificates')
      const data = await res.json()
      if (data.ok) setCerts(data.certificates)
    } catch { /* list stays empty, page still usable */ }
    setLoadingCerts(false)
  }

  async function checkEligibility() {
    if (!year || studentsForYear.length === 0) return
    setChecking(true); setError(null)
    try {
      const res = await fetch('/api/examination/certificates/eligibility', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: studentsForYear.map(s => s.id), graduationYear: year }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error); setChecking(false); return }
      const byId: Record<string, any> = {}
      for (const r of data.results) byId[r.studentId] = r
      setEligibility(byId)
      setSelected(new Set(data.results.filter((r: any) => r.eligible).map((r: any) => r.studentId)))
    } catch { setError('Network error checking eligibility.') }
    setChecking(false)
  }

  async function generate() {
    if (selected.size === 0) return
    setGenerating(true); setError(null); setNotice(null)
    try {
      const res = await fetch('/api/examination/certificates/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: Array.from(selected), graduationYear: year }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error); setGenerating(false); return }
      setNotice(`${data.createdCount} certificate${data.createdCount === 1 ? '' : 's'} staged for approval.${data.skipped.length ? ` ${data.skipped.length} skipped (already exist or ineligible).` : ''}`)
      setSelected(new Set())
      await loadCerts()
    } catch { setError('Network error generating certificates.') }
    setGenerating(false)
  }

  async function approve(id: string) {
    setBusyId(id); setError(null)
    try {
      const res = await fetch(`/api/examination/certificates/${id}/approve`, { method: 'POST' })
      const data = await res.json()
      if (!data.ok) { setError(data.error); setBusyId(null); return }
      await loadCerts()
    } catch { setError('Network error issuing certificate.') }
    setBusyId(null)
  }

  async function revoke(id: string) {
    const reason = window.prompt('Reason for revoking this certificate:')
    if (!reason) return
    setBusyId(id); setError(null)
    try {
      const res = await fetch(`/api/examination/certificates/${id}/revoke`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error); setBusyId(null); return }
      await loadCerts()
    } catch { setError('Network error revoking certificate.') }
    setBusyId(null)
  }

  const statusBadge = (status: string) => {
    const map: Record<string, { bg: string; color: string; label: string }> = {
      draft:            { bg: 'var(--glass-bg)', color: 'var(--text-muted)', label: 'Draft' },
      pending_approval: { bg: 'var(--warning-subtle, rgba(245,158,11,0.12))', color: 'var(--warning)', label: 'Pending Approval' },
      issued:           { bg: 'var(--success-subtle)', color: 'var(--success)', label: 'Issued' },
      revoked:          { bg: 'var(--danger-subtle)', color: 'var(--danger)', label: 'Revoked' },
    }
    const s = map[status] ?? map.draft
    return <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: s.bg, color: s.color }}>{s.label}</span>
  }

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Certificates">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>

        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, fontSize: '0.82rem', color: 'var(--danger)' }}>
            <AlertIcon size={14} /><span style={{ flex: 1 }}>{error}</span>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex' }}><XIcon size={13} /></button>
          </div>
        )}
        {notice && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--success-subtle)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10, fontSize: '0.82rem', color: 'var(--success)' }}>
            <CheckCircleIcon size={14} /><span style={{ flex: 1 }}>{notice}</span>
            <button onClick={() => setNotice(null)} style={{ background: 'none', border: 'none', color: 'var(--success)', cursor: 'pointer', display: 'flex' }}><XIcon size={13} /></button>
          </div>
        )}

        <button onClick={() => setShowSettings(s => !s)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, alignSelf: 'flex-start', padding: '8px 14px', borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          <SettingsIcon size={14} /> Certificate Settings
        </button>
        {showSettings && <CertificateSettingsForm school={school} onClose={() => setShowSettings(false)} />}

        {/* ── Generate ─────────────────────────────────────────── */}
        <div className="glass-card" style={{ flexDirection: 'column', padding: 'var(--space-5)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <GraduationCapIcon size={18} color={sc} /> Issue Graduation Certificates
          </h2>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' as const }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Graduating class of</label>
            <select value={year ?? ''} onChange={e => { setYear(Number(e.target.value)); setEligibility({}); setSelected(new Set()) }}
              style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', fontSize: '0.82rem' }}>
              {years.length === 0 && <option value={new Date().getFullYear()}>{new Date().getFullYear()}</option>}
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-faint)' }}>{studentsForYear.length} graduated student{studentsForYear.length === 1 ? '' : 's'}</span>
            <button onClick={checkEligibility} disabled={checking || studentsForYear.length === 0}
              style={{ marginLeft: 'auto', padding: '8px 14px', borderRadius: 8, background: sc, color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.78rem', cursor: 'pointer', opacity: checking ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {checking ? <RefreshIcon size={13} /> : null} {checking ? 'Checking...' : 'Check Eligibility'}
            </button>
          </div>

          {Object.keys(eligibility).length > 0 && (
            <>
              <div style={{ maxHeight: 280, overflowY: 'auto' as const, display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {studentsForYear.map(s => {
                  const e = eligibility[s.id]
                  const isSelected = selected.has(s.id)
                  return (
                    <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', opacity: e?.eligible ? 1 : 0.6 }}>
                      <input type="checkbox" checked={isSelected} disabled={!e?.eligible}
                        onChange={() => setSelected(prev => { const next = new Set(prev); next.has(s.id) ? next.delete(s.id) : next.add(s.id); return next })} />
                      <span style={{ flex: 1, fontSize: '0.82rem', color: 'var(--text-primary)', fontWeight: 600 }}>{s.full_name}</span>
                      <span style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>{s.class_name}</span>
                      {e && !e.eligible && <span style={{ fontSize: '0.7rem', color: 'var(--danger)' }}>{e.reasons[0]}</span>}
                      {e?.eligible && <CheckCircleIcon size={14} color="var(--success)" />}
                    </div>
                  )
                })}
              </div>
              <button onClick={generate} disabled={generating || selected.size === 0}
                style={{ padding: '10px 18px', borderRadius: 10, background: 'var(--success)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', opacity: generating || selected.size === 0 ? 0.6 : 1 }}>
                {generating ? 'Generating...' : `Generate ${selected.size} Certificate${selected.size === 1 ? '' : 's'}`}
              </button>
            </>
          )}
        </div>

        {/* ── List ─────────────────────────────────────────────── */}
        <div className="glass-card" style={{ flexDirection: 'column', padding: 'var(--space-5)' }}>
          <h2 style={{ margin: '0 0 12px', fontSize: '1rem', fontWeight: 800, color: 'var(--text-primary)' }}>All Certificates</h2>
          {loadingCerts ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Loading...</p>
          ) : certs.length === 0 ? (
            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>No certificates yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {certs.map(c => (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', flexWrap: 'wrap' as const }}>
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>{c.student?.full_name ?? 'Unknown'}</p>
                    <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-faint)' }}>{c.certificate_number} · {c.graduation_year}</p>
                  </div>
                  {statusBadge(c.status)}
                  {c.status === 'issued' && c.pdf_url && (
                    <a href={c.pdf_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '0.75rem', color: sc, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
                      <FileTextIcon size={13} /> PDF
                    </a>
                  )}
                  {(c.status === 'draft' || c.status === 'pending_approval') && (
                    <button onClick={() => approve(c.id)} disabled={busyId === c.id}
                      style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--success)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', opacity: busyId === c.id ? 0.6 : 1 }}>
                      {busyId === c.id ? '...' : 'Approve & Issue'}
                    </button>
                  )}
                  {c.status === 'issued' && (
                    <button onClick={() => revoke(c.id)} disabled={busyId === c.id}
                      style={{ padding: '6px 12px', borderRadius: 8, background: 'transparent', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', fontWeight: 700, fontSize: '0.75rem', cursor: 'pointer', opacity: busyId === c.id ? 0.6 : 1 }}>
                      {busyId === c.id ? '...' : 'Revoke'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RolePageWrapper>
  )
}

function CertificateSettingsForm({ school, onClose }: { school: any; onClose: () => void }) {
  const [form, setForm] = useState({ principal_name: '', principal_title: 'Principal', certificate_prefix: 'CERT', verification_base_url: '', signature_url: '', stamp_url: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingField, setUploadingField] = useState<'signature_url' | 'stamp_url' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/examination/certificates/settings')
        const data = await res.json()
        if (data.ok && data.settings) setForm(f => ({ ...f, ...data.settings }))
      } catch { /* leave defaults, form is still usable */ }
      setLoading(false)
    })()
  }, [])

  async function uploadAsset(field: 'signature_url' | 'stamp_url', file: File) {
    setUploadingField(field); setError(null)
    try {
      const supabase = createClient()
      const path = `certificates/${school?.id}/${field}-${Date.now()}-${file.name}`
      const { error: upErr } = await supabase.storage.from('school-assets').upload(path, file, { upsert: true })
      if (upErr) { setError(upErr.message); setUploadingField(null); return }
      const { data } = supabase.storage.from('school-assets').getPublicUrl(path)
      setForm(f => ({ ...f, [field]: data.publicUrl }))
    } catch { setError('Upload failed. Try again.') }
    setUploadingField(null)
  }

  async function save() {
    setSaving(true); setError(null); setSaved(false)
    try {
      const res = await fetch('/api/examination/certificates/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!data.ok) { setError(data.error); setSaving(false); return }
      setSaved(true)
    } catch { setError('Network error saving settings.') }
    setSaving(false)
  }

  if (loading) return <div className="glass-card" style={{ padding: 'var(--space-5)' }}><p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: 0 }}>Loading settings...</p></div>

  return (
    <div className="glass-card" style={{ flexDirection: 'column', padding: 'var(--space-5)', gap: 12 }}>
      {error && <p style={{ fontSize: '0.78rem', color: 'var(--danger)', margin: 0 }}>{error}</p>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <Field label="Principal Name" value={form.principal_name} onChange={v => setForm(f => ({ ...f, principal_name: v }))} />
        <Field label="Principal Title" value={form.principal_title} onChange={v => setForm(f => ({ ...f, principal_title: v }))} />
        <Field label="Certificate Prefix" value={form.certificate_prefix} onChange={v => setForm(f => ({ ...f, certificate_prefix: v.toUpperCase() }))} placeholder="CERT" />
        <Field label="Verification Base URL" value={form.verification_base_url} onChange={v => setForm(f => ({ ...f, verification_base_url: v }))} placeholder="https://yourschool.schoolos.app" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <AssetUpload label="Principal Signature" url={form.signature_url} uploading={uploadingField === 'signature_url'} onUpload={f => uploadAsset('signature_url', f)} />
        <AssetUpload label="School Stamp / Seal" url={form.stamp_url} uploading={uploadingField === 'stamp_url'} onUpload={f => uploadAsset('stamp_url', f)} />
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '9px 16px', borderRadius: 8, background: 'var(--success)', color: '#fff', border: 'none', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving...' : saved ? 'Saved ✓' : 'Save Settings'}
        </button>
        <button onClick={onClose} style={{ padding: '9px 16px', borderRadius: 8, background: 'transparent', border: '1px solid var(--glass-border)', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
          Close
        </button>
      </div>
      <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)', margin: 0 }}>
        These apply to certificates issued from now on. Already-issued certificates keep the signature/stamp/details in place at the time they were issued.
      </p>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>{label}</span>
      <input value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text-primary)', fontSize: '0.82rem' }} />
    </label>
  )
}

function AssetUpload({ label, url, uploading, onUpload }: { label: string; url: string; uploading: boolean; onUpload: (f: File) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 700 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {url ? <img src={url} alt={label} style={{ height: 32, objectFit: 'contain' as const, background: '#fff', borderRadius: 4, padding: 2 }} /> : null}
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 12px', borderRadius: 8, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', color: 'var(--text-secondary)', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
          <UploadIcon size={13} /> {uploading ? 'Uploading...' : url ? 'Replace' : 'Upload'}
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={uploading}
            onChange={e => e.target.files?.[0] && onUpload(e.target.files[0])} />
        </label>
      </div>
    </div>
  )
}
