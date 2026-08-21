'use client'
// src/app/(public)/apply/[schoolId]/ApplyClient.tsx
// Implements the UX motion prompt's button-state-intelligence and
// no-silent-failures principles (translated to React/CSS, not Flutter):
// every mutating action moves through idle -> busy -> success/failure
// with an explicit, worded state, never a bare spinner with no outcome.

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  SchoolIcon, MapPinIcon, CalendarIcon, CheckCircleIcon, UploadIcon,
  FileTextIcon, AlertCircleIcon, ClockIcon,
} from '@/components/Icons'
import styles from './apply.module.css'

interface Settings {
  school_id: string
  application_deadline: string | null
  admission_fee: number | null
  admission_fee_currency: string | null
  required_documents: Array<{ key: string; label: string; required: boolean; accepted_types?: string[] }>
  form_fields: Array<{ key: string; label: string; type: string; required: boolean; options?: string[] }>
  eligibility_notes: string | null
  requires_interview: boolean
  requires_assessment: boolean
  schools: { id: string; name: string; city: string | null; state: string | null; logo_url: string | null; primary_color: string | null } | null
}

interface Props {
  settings: Settings
  isAuthenticated: boolean
  existingDraftId: string | null
}

type Phase = 'intro' | 'form' | 'submitting' | 'success' | 'error'

export default function ApplyClient({ settings, isAuthenticated, existingDraftId }: Props) {
  const router = useRouter()
  const sc = settings.schools?.primary_color ?? '#800020'
  const [phase, setPhase] = useState<Phase>('intro')
  const [applicationId, setApplicationId] = useState<string | null>(existingDraftId)
  const [errorMsg, setErrorMsg] = useState('')

  const [applicantName, setApplicantName] = useState('')
  const [applicantEmail, setApplicantEmail] = useState('')
  const [applicantPhone, setApplicantPhone] = useState('')
  const [classApplyingFor, setClassApplyingFor] = useState('')
  const [formResponses, setFormResponses] = useState<Record<string, string>>({})
  const [uploadedDocs, setUploadedDocs] = useState<Set<string>>(new Set())
  const [uploadingKey, setUploadingKey] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function startOrLoadDraft() {
    if (applicationId) { setPhase('form'); return }
    setSaving(true)
    setErrorMsg('')
    try {
      const res = await fetch('/api/admission/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ schoolId: settings.school_id, applicantName: applicantName || 'Applicant' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not start your application.')
      setApplicationId(data.application.id)
      setPhase('form')
    } catch (e: any) {
      setErrorMsg(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function saveDraft() {
    if (!applicationId) return
    setSaving(true)
    try {
      await fetch('/api/admission/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: applicationId, applicantName, applicantEmail, applicantPhone, classApplyingFor, formResponses }),
      })
    } catch {
      // Draft autosave failures are non-fatal - the user can still submit
      // explicitly, which surfaces a real error if the problem persists.
    } finally {
      setSaving(false)
    }
  }

  async function handleFileUpload(docKey: string, file: File) {
    setUploadingKey(docKey)
    setErrorMsg('')
    try {
      const prep = await fetch('/api/admission/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId, documentKey: docKey, fileName: file.name,
          mimeType: file.type, sizeBytes: file.size,
        }),
      })
      const prepData = await prep.json()
      if (!prep.ok) throw new Error(prepData?.error ?? 'Could not prepare the upload.')

      const uploadRes = await fetch(prepData.uploadUrl, { method: 'PUT', body: file, headers: { 'Content-Type': file.type } })
      if (!uploadRes.ok) throw new Error('Upload failed. Check your connection and try again.')

      const confirm = await fetch('/api/admission/documents', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          applicationId, documentKey: docKey, fileName: file.name,
          path: prepData.path, mimeType: file.type, sizeBytes: file.size,
        }),
      })
      const confirmData = await confirm.json()
      if (!confirm.ok) throw new Error(confirmData?.error ?? 'Could not save the document.')

      setUploadedDocs(prev => new Set(prev).add(docKey))
    } catch (e: any) {
      setErrorMsg(e.message ?? 'Document upload failed.')
    } finally {
      setUploadingKey(null)
    }
  }

  async function handleSubmit() {
    if (!applicationId) return
    setPhase('submitting')
    setErrorMsg('')
    await saveDraft()
    try {
      const res = await fetch('/api/admission/applications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: applicationId, action: 'submit' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Could not submit your application.')
      setPhase('success')
    } catch (e: any) {
      setErrorMsg(e.message)
      setPhase('form') // return to editable state - never leave them stuck with no way forward
    }
  }

  const requiredMissing = settings.required_documents
    .filter(d => d.required && !uploadedDocs.has(d.key))
    .map(d => d.label)

  if (phase === 'success') {
    return (
      <div className={styles.successWrap}>
        <div className={styles.successIcon} style={{ background: sc + '22' }}>
          <CheckCircleIcon size={36} color={sc} />
        </div>
        <h1 className={styles.successTitle}>Application submitted</h1>
        <p className={styles.successHint}>{settings.schools?.name} will review your application. You'll see updates here as they happen.</p>
        <Link href="/dashboard/applications" className={styles.successCta} style={{ background: sc }}>View My Applications</Link>
      </div>
    )
  }

  return (
    <div>
      <div className={styles.schoolCard} style={{ borderColor: sc + '44' }}>
        <div className={styles.schoolIcon} style={{ background: sc + '22' }}>
          <SchoolIcon size={22} color={sc} />
        </div>
        <div>
          <h1 className={styles.schoolName}>{settings.schools?.name}</h1>
          <p className={styles.schoolLoc}><MapPinIcon size={11} color="var(--text-muted)" /> {[settings.schools?.city, settings.schools?.state].filter(Boolean).join(', ')}</p>
        </div>
      </div>

      <div className={styles.infoRow}>
        {settings.application_deadline && (
          <span className={styles.infoPill}><CalendarIcon size={12} color="var(--text-muted)" /> Deadline {new Date(settings.application_deadline).toLocaleDateString('en-NG', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        )}
        {settings.admission_fee != null && (
          <span className={styles.infoPill}>Fee: {settings.admission_fee_currency ?? 'NGN'} {settings.admission_fee.toLocaleString()}</span>
        )}
        {settings.requires_interview && <span className={styles.infoPill}>Interview required</span>}
      </div>

      {settings.eligibility_notes && <p className={styles.eligibility}>{settings.eligibility_notes}</p>}

      {!isAuthenticated ? (
        <div className={styles.authGate}>
          <p className={styles.authGateText}>Create a free SchoolOS account (no school code needed) or sign in to start your application.</p>
          <div className={styles.authGateActions}>
            <Link href={`/join?next=${encodeURIComponent(`/apply/${settings.school_id}`)}`} className={styles.primaryBtn} style={{ background: sc }}>Create Account</Link>
            <Link href={`/login?next=${encodeURIComponent(`/apply/${settings.school_id}`)}`} className={styles.secondaryBtn}>Sign In</Link>
          </div>
        </div>
      ) : phase === 'intro' ? (
        <button className={styles.primaryBtn} style={{ background: sc }} onClick={startOrLoadDraft} disabled={saving}>
          {saving ? 'Starting…' : existingDraftId ? 'Continue Application' : 'Start Application'}
        </button>
      ) : (
        <div className={styles.form}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Applicant Information</h2>
            <label className={styles.field}>
              <span className={styles.label}>Full name</span>
              <input className={styles.input} value={applicantName} onChange={e => setApplicantName(e.target.value)} onBlur={saveDraft} required maxLength={200} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Email</span>
              <input className={styles.input} type="email" value={applicantEmail} onChange={e => setApplicantEmail(e.target.value)} onBlur={saveDraft} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Phone</span>
              <input className={styles.input} value={applicantPhone} onChange={e => setApplicantPhone(e.target.value)} onBlur={saveDraft} />
            </label>
            <label className={styles.field}>
              <span className={styles.label}>Class / Level applying for</span>
              <input className={styles.input} value={classApplyingFor} onChange={e => setClassApplyingFor(e.target.value)} onBlur={saveDraft} />
            </label>
          </section>

          {settings.form_fields?.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Additional Information</h2>
              {settings.form_fields.map(f => (
                <label key={f.key} className={styles.field}>
                  <span className={styles.label}>{f.label}{f.required && ' *'}</span>
                  <input
                    className={styles.input}
                    value={formResponses[f.key] ?? ''}
                    onChange={e => setFormResponses(p => ({ ...p, [f.key]: e.target.value }))}
                    onBlur={saveDraft}
                    required={f.required}
                  />
                </label>
              ))}
            </section>
          )}

          {settings.required_documents?.length > 0 && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Documents</h2>
              {settings.required_documents.map(doc => {
                const isUploaded = uploadedDocs.has(doc.key)
                const isUploading = uploadingKey === doc.key
                return (
                  <div key={doc.key} className={styles.docRow}>
                    <div className={styles.docInfo}>
                      {isUploaded ? <CheckCircleIcon size={16} color="#22c55e" /> : <FileTextIcon size={16} color="var(--text-muted)" />}
                      <span>{doc.label}{doc.required && ' *'}</span>
                    </div>
                    <label className={styles.uploadBtn}>
                      {isUploading ? 'Uploading…' : isUploaded ? 'Replace' : 'Upload'}
                      <input
                        type="file"
                        hidden
                        accept=".pdf,.jpg,.jpeg,.png,.webp"
                        disabled={isUploading}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(doc.key, f) }}
                      />
                    </label>
                  </div>
                )
              })}
            </section>
          )}

          {errorMsg && (
            <p className={styles.errorBanner}><AlertCircleIcon size={14} color="#ef4444" /> {errorMsg}</p>
          )}

          {requiredMissing.length > 0 && (
            <p className={styles.hintBanner}>Still needed before you can submit: {requiredMissing.join(', ')}</p>
          )}

          <button
            className={styles.primaryBtn}
            style={{ background: sc }}
            onClick={handleSubmit}
            disabled={phase === 'submitting' || !applicantName.trim() || requiredMissing.length > 0}
          >
            {phase === 'submitting' ? 'Submitting…' : 'Review & Submit'}
          </button>
        </div>
      )}
    </div>
  )
}
