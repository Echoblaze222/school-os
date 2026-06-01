'use client'

// src/app/dashboard/teacher/assignments/new/NewAssignmentClient.tsx

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './new-assignment.module.css'
import type { TeacherClassOption } from './page'

interface Props {
  classes:   TeacherClassOption[]
  teacherId: string
}

interface FormState {
  class_id:    string
  subject:     string
  title:       string
  description: string
  due_date:    string
  due_time:    string
  max_score:   string
}

const EMPTY: FormState = {
  class_id:    '',
  subject:     '',
  title:       '',
  description: '',
  due_date:    '',
  due_time:    '23:59',
  max_score:   '100',
}

/* ── Character counter ───────────────────────────────────── */
function CharCount({ current, max }: { current: number; max: number }) {
  const pct = current / max
  return (
    <span
      className={styles.charCount}
      style={{
        color: pct > 0.9 ? 'var(--error)' : pct > 0.75 ? 'var(--warning)' : 'var(--text-muted)',
      }}
    >
      {current}/{max}
    </span>
  )
}

/* ── Main ────────────────────────────────────────────────── */
export default function NewAssignmentClient({ classes, teacherId }: Props) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [form, setForm]           = useState<FormState>(EMPTY)
  const [file, setFile]           = useState<File | null>(null)
  const [errors, setErrors]       = useState<Partial<FormState>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [success, setSuccess]     = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)

  useEffect(() => {
    const theme = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', theme)
    // Default due date = tomorrow
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    setForm(f => ({ ...f, due_date: tomorrow.toISOString().split('T')[0] }))
  }, [])

  // Auto-fill subject when class is chosen
  function handleClassChange(classId: string) {
    const cls = classes.find(c => c.id === classId)
    setForm(f => ({
      ...f,
      class_id: classId,
      subject:  cls?.subject ?? f.subject,
    }))
  }

  function validate(): boolean {
    const e: Partial<FormState> = {}
    if (!form.class_id)     e.class_id    = 'Select a class'
    if (!form.title.trim()) e.title       = 'Title is required'
    if (!form.due_date)     e.due_date    = 'Due date is required'
    const score = Number(form.max_score)
    if (isNaN(score) || score < 1 || score > 1000) e.max_score = 'Score must be 1–1000'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    setSubmitError('')
    setUploadProgress(0)

    try {
      const supabase = createClient()
      let file_url: string | null = null

      // ── Upload attachment if present
      if (file) {
        const ext  = file.name.split('.').pop()
        const path = `assignments/${teacherId}/${Date.now()}.${ext}`

        // Simulate progress (Supabase storage doesn't expose real progress)
        const progressInterval = setInterval(() => {
          setUploadProgress(p => Math.min(p + 15, 85))
        }, 200)

        const { error: uploadError } = await supabase.storage
          .from('assignment-files')
          .upload(path, file, { upsert: false })

        clearInterval(progressInterval)

        if (uploadError) throw new Error(`File upload failed: ${uploadError.message}`)

        setUploadProgress(90)

        const { data: urlData } = supabase.storage
          .from('assignment-files')
          .getPublicUrl(path)

        file_url = urlData.publicUrl
      }

      setUploadProgress(95)

      // ── Insert assignment row
      const dueDatetime = `${form.due_date}T${form.due_time}:00`

      const { error: insertError } = await supabase.from('assignments').insert({
        teacher_id:   teacherId,
        class_id:     form.class_id,
        subject:      form.subject || classes.find(c => c.id === form.class_id)?.subject,
        title:        form.title.trim(),
        description:  form.description.trim() || null,
        due_date:     dueDatetime,
        max_score:    Number(form.max_score),
        file_url,
        submission_count: 0,
        graded_count:     0,
        status:           'active',
      })

      if (insertError) throw new Error(insertError.message)

      setUploadProgress(100)
      setSuccess(true)

      setTimeout(() => router.push('/dashboard/teacher/assignments'), 1500)
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setUploadProgress(0)
    } finally {
      setSubmitting(false)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    if (f && f.size > 50 * 1024 * 1024) {
      setSubmitError('File must be under 50 MB')
      return
    }
    setFile(f)
    setSubmitError('')
  }

  function removeFile() {
    setFile(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function fileSize(bytes: number) {
    if (bytes < 1024)       return `${bytes} B`
    if (bytes < 1024*1024)  return `${(bytes/1024).toFixed(1)} KB`
    return                        `${(bytes/1024/1024).toFixed(1)} MB`
  }

  if (success) {
    return (
      <div className={styles.successPage}>
        <div className={`burgundy-glow-orb ${styles.successOrb}`} aria-hidden />
        <div className={`glass-card ${styles.successCard} animate-scale-in`}>
          <div className={styles.successIcon}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h2 className={styles.successTitle}>Assignment Posted</h2>
          <p className={styles.successBody}>
            <strong>{form.title}</strong> has been assigned successfully. Students will be notified.
          </p>
          <div className={styles.successSpinner} aria-label="Redirecting…" />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={`burgundy-glow-orb ${styles.orb1}`} aria-hidden />

      {/* ── Header ── */}
      <header className={styles.header}>
        <button
          onClick={() => router.back()}
          className={styles.backBtn}
          aria-label="Go back"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>Post Assignment</h1>
          <p className={styles.subtitle}>Create & assign work</p>
        </div>
        <div style={{ width: 38 }} />
      </header>

      {/* ── Form ── */}
      <main className={styles.formMain}>

        {/* Class selector */}
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="class_id">
            Class <span className={styles.required}>*</span>
          </label>
          {classes.length === 0 ? (
            <div className={styles.noClasses}>No classes assigned yet.</div>
          ) : (
            <div className={styles.classGrid}>
              {classes.map(cls => (
                <button
                  key={cls.id}
                  type="button"
                  className={`${styles.classChip} ${form.class_id === cls.id ? styles.classChipActive : ''}`}
                  onClick={() => handleClassChange(cls.id)}
                  aria-pressed={form.class_id === cls.id}
                >
                  <span className={styles.classChipName}>{cls.name}</span>
                  <span className={styles.classChipSub}>{cls.subject}</span>
                </button>
              ))}
            </div>
          )}
          {errors.class_id && <p className={styles.errorMsg}>{errors.class_id}</p>}
        </div>

        {/* Subject (auto-filled but editable) */}
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="subject">Subject</label>
          <input
            id="subject"
            className={`input ${styles.input} ${errors.subject ? styles.inputError : ''}`}
            value={form.subject}
            onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
            placeholder="e.g. Mathematics"
          />
        </div>

        {/* Title */}
        <div className={styles.fieldGroup}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor="title">
              Title <span className={styles.required}>*</span>
            </label>
            <CharCount current={form.title.length} max={120} />
          </div>
          <input
            id="title"
            className={`input ${styles.input} ${errors.title ? styles.inputError : ''}`}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value.slice(0, 120) }))}
            placeholder="e.g. Chapter 5 Quadratic Equations"
            autoComplete="off"
          />
          {errors.title && <p className={styles.errorMsg}>{errors.title}</p>}
        </div>

        {/* Description */}
        <div className={styles.fieldGroup}>
          <div className={styles.labelRow}>
            <label className={styles.label} htmlFor="description">Instructions</label>
            <CharCount current={form.description.length} max={1000} />
          </div>
          <textarea
            id="description"
            className={`input ${styles.textarea}`}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value.slice(0, 1000) }))}
            placeholder="Add detailed instructions for students…"
            rows={4}
          />
        </div>

        {/* Due date + time */}
        <div className={styles.dueDateRow}>
          <div className={`${styles.fieldGroup} ${styles.flex1}`}>
            <label className={styles.label} htmlFor="due_date">
              Due Date <span className={styles.required}>*</span>
            </label>
            <input
              id="due_date"
              type="date"
              className={`input ${styles.input} ${errors.due_date ? styles.inputError : ''}`}
              value={form.due_date}
              min={new Date().toISOString().split('T')[0]}
              onChange={e => setForm(f => ({ ...f, due_date: e.target.value }))}
            />
            {errors.due_date && <p className={styles.errorMsg}>{errors.due_date}</p>}
          </div>
          <div className={`${styles.fieldGroup} ${styles.timeField}`}>
            <label className={styles.label} htmlFor="due_time">Time</label>
            <input
              id="due_time"
              type="time"
              className={`input ${styles.input}`}
              value={form.due_time}
              onChange={e => setForm(f => ({ ...f, due_time: e.target.value }))}
            />
          </div>
        </div>

        {/* Max Score */}
        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="max_score">
            Maximum Score <span className={styles.required}>*</span>
          </label>
          <div className={styles.scoreInputWrap}>
            <input
              id="max_score"
              type="number"
              className={`input ${styles.input} ${errors.max_score ? styles.inputError : ''}`}
              value={form.max_score}
              min={1}
              max={1000}
              onChange={e => setForm(f => ({ ...f, max_score: e.target.value }))}
            />
            <div className={styles.scorePresets}>
              {[25, 50, 100].map(n => (
                <button
                  key={n}
                  type="button"
                  className={`${styles.presetBtn} ${Number(form.max_score) === n ? styles.presetBtnActive : ''}`}
                  onClick={() => setForm(f => ({ ...f, max_score: String(n) }))}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {errors.max_score && <p className={styles.errorMsg}>{errors.max_score}</p>}
        </div>

        {/* File upload */}
        <div className={styles.fieldGroup}>
          <label className={styles.label}>Attachment <span className={styles.optional}>(optional, max 50 MB)</span></label>
          {file ? (
            <div className={styles.filePreview}>
              <div className={styles.filePreviewIcon}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <div className={styles.filePreviewInfo}>
                <span className={styles.filePreviewName}>{file.name}</span>
                <span className={styles.filePreviewSize}>{fileSize(file.size)}</span>
              </div>
              <button
                type="button"
                className={styles.fileRemoveBtn}
                onClick={removeFile}
                aria-label="Remove file"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          ) : (
            <div
              className={styles.dropZone}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add(styles.dragOver) }}
              onDragLeave={e => { e.currentTarget.classList.remove(styles.dragOver) }}
              onDrop={e => {
                e.preventDefault()
                e.currentTarget.classList.remove(styles.dragOver)
                const f = e.dataTransfer.files[0]
                if (f) {
                  if (f.size > 50*1024*1024) { setSubmitError('File must be under 50 MB'); return }
                  setFile(f)
                }
              }}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && fileInputRef.current?.click()}
              aria-label="Upload attachment"
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
                <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/>
              </svg>
              <span className={styles.dropZoneText}>
                Drop a file here or <strong>tap to browse</strong>
              </span>
              <span className={styles.dropZoneSub}>PDF, DOCX, JPG, PNG, ZIP…</span>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            className={styles.hiddenInput}
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.zip,.mp4,.pptx,.xlsx"
            aria-hidden
          />
        </div>

        {/* Upload progress */}
        {submitting && uploadProgress > 0 && (
          <div className={styles.uploadProgressWrap}>
            <div className={styles.uploadProgressTrack}>
              <div className={styles.uploadProgressFill} style={{ width: `${uploadProgress}%` }} />
            </div>
            <span className={styles.uploadProgressLabel}>
              {uploadProgress < 90 ? 'Uploading…' : uploadProgress < 100 ? 'Saving…' : 'Done!'}
            </span>
          </div>
        )}

        {/* Error */}
        {submitError && (
          <div className={styles.formError}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            {submitError}
          </div>
        )}

        {/* Actions */}
        <div className={styles.formActions}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.back()}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className={`btn btn-primary ${styles.submitBtn}`}
            onClick={handleSubmit}
            disabled={submitting || classes.length === 0}
          >
            {submitting ? (
              <><span className={styles.spinner} />Posting…</>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
                </svg>
                Post Assignment
              </>
            )}
          </button>
        </div>
      </main>
    </div>
  )
}
