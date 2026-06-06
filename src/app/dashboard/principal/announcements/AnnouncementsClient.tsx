'use client'

// src/app/dashboard/principal/announcements/AnnouncementsClient.tsx

import { useEffect, useState, useRef } from 'react'
import { useRealtimeTable } from '@/hooks/useRealtimeTable'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { AnnouncementRow, AudienceType, ClassOption } from './page'
import styles from './announcements.module.css'

interface Props {
  announcements: AnnouncementRow[]
  classOptions: ClassOption[]
  creatorId: string
  creatorName: string
  schoolId: string
}

const AUDIENCE_LABELS: Record<AudienceType, string> = {
  all: 'All',
  students: 'Students',
  teachers: 'Teachers',
  parents: 'Parents',
  staff: 'Staff',
}

function audienceClass(a: AudienceType): string {
  const map: Record<AudienceType, string> = {
    all: styles.audienceAll,
    students: styles.audienceStudents,
    teachers: styles.audienceTeachers,
    parents: styles.audienceParents,
    staff: styles.audienceStaff,
  }
  return map[a]
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// ── Icons ─────────────────────────────────────────────────
const IconChevronLeft = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
const IconSun = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconPlus = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
const IconClock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IconUser = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const IconCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconAlertCircle = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>

const BODY_LIMIT = 1000

// ── Main Component ────────────────────────────────────────
export default function AnnouncementsClient({ announcements: initialAnnouncements, classOptions, creatorId, creatorName, schoolId }: Props) {
  const router = useRouter()
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  // ── Realtime: new/deleted announcements appear instantly ─────────────────
  const [announcements, setAnnouncements] = useRealtimeTable<AnnouncementRow>({
    table:   'announcements',
    filter:  schoolId ? `school_id=eq.${schoolId}` : undefined,
    initial: initialAnnouncements,
    orderBy: (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  })
  const [selected, setSelected] = useState<AnnouncementRow | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [audience, setAudience] = useState<AudienceType>('all')
  const [classId, setClassId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formStatus, setFormStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [confirmDel, setConfirmDel] = useState<AnnouncementRow | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme')
    const dark = saved !== 'light'
    setIsDark(dark)
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    setMounted(true)

    // Auto-open compose if ?new=1 in URL
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      if (params.get('new') === '1') {
        setTimeout(() => titleRef.current?.focus(), 300)
      }
    }
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light')
    localStorage.setItem('schoolos_theme', next ? 'dark' : 'light')
  }

  function resetForm() {
    setTitle('')
    setBody('')
    setAudience('all')
    setClassId('')
    setFormStatus('idle')
    setErrorMsg('')
  }

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  async function handleDelete(ann: AnnouncementRow) {
    setDeleting(ann.id)
    setDeleteError('')
    const supabase = createClient()
    const { error } = await supabase.from('announcements').delete().eq('id', ann.id)
    setDeleting(null)
    if (error) { setDeleteError(error.message); return }
    setAnnouncements(prev => prev.filter(a => a.id !== ann.id))
    setConfirmDel(null)
    if (selected?.id === ann.id) setSelected(null)
    showToast('Announcement deleted')
  }

  async function handleSubmit() {
    if (!title.trim() || !body.trim()) return
    setIsSubmitting(true)
    setFormStatus('idle')

    const supabase = createClient()
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        title: title.trim(),
        body: body.trim(),
        audience,
        class_id: classId || null,
        created_by: creatorId,
      })
      .select(`
        id, title, body, audience, class_id, created_at,
        classes ( name ),
        profiles:created_by ( full_name )
      `)
      .single()

    setIsSubmitting(false)

    if (error) {
      setFormStatus('error')
      setErrorMsg(error.message)
      return
    }

    // Prepend new announcement to list
    const newRow: AnnouncementRow = {
      id: data.id,
      title: data.title,
      body: data.body,
      audience: data.audience,
      class_id: data.class_id,
      class_name: data.classes?.[0]?.name ?? null,
      created_at: data.created_at,
      created_by_name: data.profiles?.[0]?.full_name ?? creatorName,
    }

    setAnnouncements((prev) => [newRow, ...prev])
    setFormStatus('success')
    setTimeout(() => {
      resetForm()
    }, 2000)
  }

  if (!mounted) return null

  const isFormValid = title.trim().length > 0 && body.trim().length > 0

  return (
    <div className={styles.page}>
      {/* Toast */}
      {toast && (
        <div style={{ position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', background:'var(--success-bg)', border:'1px solid rgba(45,139,85,0.3)', color:'var(--success)', padding:'10px 20px', borderRadius:999, fontSize:'0.82rem', fontWeight:600, zIndex:999, whiteSpace:'nowrap', animation:'fade-up 0.3s ease' }}>
          ✓ {toast}
        </div>
      )}

      {/* Delete confirm dialog */}
      {confirmDel && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:'20px' }}>
          <div style={{ background:'var(--bg-card)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', padding:'var(--space-6)', maxWidth:400, width:'100%' }}>
            <h3 style={{ fontSize:'1.1rem', fontWeight:700, color:'var(--text-primary)', margin:'0 0 12px' }}>Delete Announcement?</h3>
            <p style={{ fontSize:'0.86rem', color:'var(--text-secondary)', lineHeight:1.6, margin:'0 0 20px' }}>
              "<strong>{confirmDel.title}</strong>" will be permanently deleted.
            </p>
            {deleteError && <p style={{ color:'var(--error)', fontSize:'0.8rem', marginBottom:12 }}>{deleteError}</p>}
            <div style={{ display:'flex', gap:12, justifyContent:'flex-end' }}>
              <button onClick={() => setConfirmDel(null)} style={{ padding:'8px 20px', borderRadius:999, background:'var(--glass-bg)', border:'1px solid var(--glass-border)', color:'var(--text-secondary)', fontSize:'0.82rem', fontWeight:600, cursor:'pointer' }}>Cancel</button>
              <button onClick={() => handleDelete(confirmDel)} disabled={deleting === confirmDel.id} style={{ padding:'8px 20px', borderRadius:999, background:'var(--error-bg)', border:'1px solid rgba(192,57,43,0.3)', color:'var(--error)', fontSize:'0.82rem', fontWeight:700, cursor:'pointer', opacity: deleting === confirmDel.id ? 0.5 : 1 }}>
                {deleting === confirmDel.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Header ──────────────────────────────────────── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link href="/dashboard/principal" className={styles.backBtn}>
            <IconChevronLeft /> Dashboard
          </Link>
          <h1 className={styles.pageTitle}>
            School <span>Announcements</span>
          </h1>
        </div>
        <div className={styles.headerRight}>
          <button className={styles.themeBtn} onClick={toggleTheme}>
            {isDark ? <IconSun /> : <IconMoon />}
          </button>
          <button className={styles.newBtn} onClick={() => titleRef.current?.focus()}>
            <IconPlus /> New
          </button>
        </div>
      </header>

      {/* ── Body ────────────────────────────────────────── */}
      <div className={styles.layoutBody}>
        {/* Left: announcement list */}
        <section className={styles.listSection}>
          <p className={styles.sectionLabel}>
            {announcements.length} announcement{announcements.length !== 1 ? 's' : ''}
          </p>

          {announcements.length === 0 ? (
            <div className={styles.emptyState}>
              No announcements yet. Create your first one using the form.
            </div>
          ) : (
            <div className={styles.announcementList}>
              {announcements.map((a) => (
                <div
                  key={a.id}
                  className={`${styles.announcementCard} ${selected?.id === a.id ? styles.announcementCardSelected : ''}`}
                  onClick={() => setSelected(selected?.id === a.id ? null : a)}
                >
                  <div className={styles.cardTop}>
                    <p className={styles.announcementTitle}>{a.title}</p>
                    <span className={`${styles.audienceBadge} ${audienceClass(a.audience)}`}>
                      {AUDIENCE_LABELS[a.audience]}
                    </span>
                  </div>

                  {/* Full body if selected, preview if not */}
                  <p className={`${styles.cardBody} ${selected?.id === a.id ? '' : ''}`}
                    style={selected?.id === a.id ? { WebkitLineClamp: 'unset', display: 'block' } : {}}
                  >
                    {a.body}
                  </p>

                  <div className={styles.cardFooter}>
                    <div className={styles.cardMeta}>
                      <span className={styles.cardMetaItem}>
                        <IconClock />
                        {relativeTime(a.created_at)}
                      </span>
                      {a.created_by_name && (
                        <span className={styles.cardMetaItem}>
                          <IconUser />
                          {a.created_by_name}
                        </span>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {a.class_name && (
                        <span className={styles.classTag}>{a.class_name}</span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDel(a) }}
                        title="Delete announcement"
                        style={{ display:'flex', alignItems:'center', justifyContent:'center', width:26, height:26, borderRadius:'var(--radius-md)', background:'var(--error-bg)', border:'1px solid rgba(192,57,43,0.2)', color:'var(--error)', cursor:'pointer', opacity:0.7, flexShrink:0 }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: compose panel */}
        <section className={styles.composePanel}>
          <div className={styles.composePanelHeader}>
            <p className={styles.composePanelTitle}>New Announcement</p>
          </div>

          <div className={styles.composePanelBody}>
            {/* Success / error feedback */}
            {formStatus === 'success' && (
              <div className={styles.successMsg}>
                <IconCheck />
                Announcement published successfully!
              </div>
            )}
            {formStatus === 'error' && (
              <div className={styles.errorMsg}>
                <IconAlertCircle />
                {errorMsg || 'Failed to publish. Please try again.'}
              </div>
            )}

            {/* Title */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Title *</label>
              <input
                ref={titleRef}
                className={styles.fieldInput}
                placeholder="e.g. School Closing Tomorrow"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>

            {/* Body */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Message *</label>
              <textarea
                className={`${styles.fieldInput} ${styles.fieldTextarea}`}
                placeholder="Write the full announcement here…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={BODY_LIMIT}
                rows={5}
              />
              <p className={`${styles.charCount} ${body.length > BODY_LIMIT * 0.85 ? styles.charCountWarning : ''}`}>
                {body.length} / {BODY_LIMIT}
              </p>
            </div>

            {/* Audience */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Target Audience *</label>
              <select
                className={`${styles.fieldInput} ${styles.fieldSelect}`}
                value={audience}
                onChange={(e) => setAudience(e.target.value as AudienceType)}
              >
                <option value="all">All — Everyone</option>
                <option value="students">Students only</option>
                <option value="teachers">Teachers only</option>
                <option value="parents">Parents only</option>
                <option value="staff">Staff only</option>
              </select>
            </div>

            {/* Optional class target */}
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Specific Class (optional)</label>
              <select
                className={`${styles.fieldInput} ${styles.fieldSelect}`}
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {classOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.composePanelFooter}>
            <button className={styles.clearBtn} onClick={resetForm} type="button">
              Clear
            </button>
            <button
              className={styles.submitBtn}
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              type="button"
            >
              {isSubmitting ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}