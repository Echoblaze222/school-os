'use client'

import { useEffect, useState, useRef } from 'react'
import { useRealtimeTable } from '@/hooks/useRealtimeTable'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import type { AnnouncementRow, AudienceType, ClassOption } from './page'
import styles from './announcements.module.css'

interface Props {
  announcements: AnnouncementRow[]
  classOptions: ClassOption[]
  creatorId: string
  creatorName: string
  schoolId: string
  profile: any
  school: any
  userId: string
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

const IconClock = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
const IconUser  = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
const IconCheck = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
const IconAlertCircle = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>

const BODY_LIMIT = 1000

export default function AnnouncementsClient({
  announcements: initialAnnouncements, classOptions, creatorId, creatorName,
  schoolId, profile, school, userId,
}: Props) {
  const [announcements, setAnnouncements] = useRealtimeTable<AnnouncementRow>({
    table:   'announcements',
    filter:  schoolId ? `school_id=eq.${schoolId}` : undefined,
    initial: initialAnnouncements,
    orderBy: (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  })

  const [selected,   setSelected]   = useState<AnnouncementRow | null>(null)
  const [title,      setTitle]      = useState('')
  const [body,       setBody]       = useState('')
  const [audience,   setAudience]   = useState<AudienceType>('all')
  const [classId,    setClassId]    = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formStatus, setFormStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMsg,   setErrorMsg]   = useState('')
  const [confirmDel, setConfirmDel] = useState<AnnouncementRow | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [toast,      setToast]      = useState<string | null>(null)

  const titleRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3000) }

  function resetForm() {
    setTitle(''); setBody(''); setAudience('all'); setClassId('')
    setFormStatus('idle'); setErrorMsg('')
  }

  async function handleDelete(ann: AnnouncementRow) {
    setDeleting(ann.id); setDeleteError('')
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
    setIsSubmitting(true); setFormStatus('idle')
    const supabase = createClient()
    const { data, error } = await supabase
      .from('announcements')
      .insert({
        title: title.trim(),
        body: body.trim(),
        audience,
        school_id: schoolId,
        target_class_id: classId || null,
        created_by: creatorId,
        author_id: creatorId,
        status: 'published',
      })
      .select(`id, title, body, audience, target_class_id, created_at, classes:target_class_id ( name ), profiles:author_id ( full_name )`)
      .single()
    setIsSubmitting(false)
    if (error) { setFormStatus('error'); setErrorMsg(error.message); return }
    const newRow: AnnouncementRow = {
      id: data.id, title: data.title, body: data.body,
      audience: data.audience,
      class_id: data.target_class_id,
      class_name: (data as any).classes?.name ?? null,
      created_at: data.created_at,
      created_by_name: (data as any).profiles?.full_name ?? creatorName,
    }
    setAnnouncements(prev => [newRow, ...prev])
    setFormStatus('success')
    setTimeout(() => resetForm(), 2000)
  }

  const isFormValid = title.trim().length > 0 && body.trim().length > 0
  const sc = school?.primary_color ?? '#800020'

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="Announcements">
      {/* Toast */}
      {toast && (
        <div className={`${styles.toast} ${styles.toastOk}`}>✓ {toast}</div>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className={styles.overlay}>
          <div className={styles.dialog}>
            <h3 className={styles.dialogTitle}>Delete Announcement?</h3>
            <p className={styles.dialogBody}>
              "<strong>{confirmDel.title}</strong>" will be permanently deleted.
            </p>
            {deleteError && <p style={{ color:'var(--error)', fontSize:'0.8rem', marginBottom:12 }}>{deleteError}</p>}
            <div className={styles.dialogActions}>
              <button className={styles.dlgCancel} onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className={styles.dlgDelete} onClick={() => handleDelete(confirmDel)} disabled={deleting === confirmDel.id}>
                {deleting === confirmDel.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Two-column body ── */}
      <div className={styles.layoutBody}>

        {/* LEFT — list */}
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
              {announcements.map(a => (
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

                  <p className={styles.cardBody}
                    style={selected?.id === a.id ? { WebkitLineClamp: 'unset', display: 'block' } : {}}>
                    {a.body}
                  </p>

                  <div className={styles.cardFooter}>
                    <div className={styles.cardMeta}>
                      <span className={styles.cardMetaItem}>
                        <IconClock />{relativeTime(a.created_at)}
                      </span>
                      {a.created_by_name && (
                        <span className={styles.cardMetaItem}>
                          <IconUser />{a.created_by_name}
                        </span>
                      )}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      {a.class_name && <span className={styles.classTag}>{a.class_name}</span>}
                      <button
                        onClick={e => { e.stopPropagation(); setConfirmDel(a) }}
                        title="Delete announcement"
                        className={styles.deleteIconBtn}
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

        {/* RIGHT — compose */}
        <section className={styles.composePanel}>
          <div className={styles.composePanelHeader}>
            <p className={styles.composePanelTitle}>New Announcement</p>
          </div>

          <div className={styles.composePanelBody}>
            {formStatus === 'success' && (
              <div className={styles.successMsg}><IconCheck /> Announcement published!</div>
            )}
            {formStatus === 'error' && (
              <div className={styles.errorMsg}><IconAlertCircle /> {errorMsg || 'Failed to publish. Try again.'}</div>
            )}

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Title *</label>
              <input
                ref={titleRef}
                className={styles.fieldInput}
                placeholder="e.g. School Closing Tomorrow"
                value={title}
                onChange={e => setTitle(e.target.value)}
                maxLength={120}
              />
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Message *</label>
              <textarea
                className={`${styles.fieldInput} ${styles.fieldTextarea}`}
                placeholder="Write the full announcement here…"
                value={body}
                onChange={e => setBody(e.target.value)}
                maxLength={BODY_LIMIT}
                rows={5}
              />
              <p className={`${styles.charCount} ${body.length > BODY_LIMIT * 0.85 ? styles.charCountWarning : ''}`}>
                {body.length} / {BODY_LIMIT}
              </p>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Target Audience *</label>
              <select
                className={`${styles.fieldInput} ${styles.fieldSelect}`}
                value={audience}
                onChange={e => setAudience(e.target.value as AudienceType)}
              >
                <option value="all">All — Everyone</option>
                <option value="students">Students only</option>
                <option value="teachers">Teachers only</option>
                <option value="parents">Parents only</option>
                <option value="staff">Staff only</option>
              </select>
            </div>

            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>Specific Class (optional)</label>
              <select
                className={`${styles.fieldInput} ${styles.fieldSelect}`}
                value={classId}
                onChange={e => setClassId(e.target.value)}
              >
                <option value="">All classes</option>
                {classOptions.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.composePanelFooter}>
            <button className={styles.clearBtn} onClick={resetForm} type="button">Clear</button>
            <button
              className={styles.submitBtn}
              style={{ background: sc }}
              onClick={handleSubmit}
              disabled={!isFormValid || isSubmitting}
              type="button"
            >
              {isSubmitting ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </section>
      </div>

      <div style={{ height: 80 }} />
    </RolePageWrapper>
  )
}
