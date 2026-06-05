'use client'
// ─────────────────────────────────────────────────────────────
//  AnnouncementsClient.tsx
//  Unified component for ALL writer roles:
//    • Principal  → /dashboard/principal/announcements
//    • Secretary  → /dashboard/secretary/notices
//    • Teacher    → /dashboard/teacher/announcements
//
//  FIXES:
//   ✓ Typing works — controlled inputs wired correctly
//   ✓ Click-to-expand shows full message in-place (no separate modal needed)
//   ✓ posted_by field populated from userId prop
//   ✓ priority column included in insert + display
//   ✓ Real-time insert: new post appears instantly at top
//   ✓ Compose panel always visible (no hidden toggle)
//   ✓ Character counter live
//   ✓ School-scoped queries (school_id)
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './announcements.module.css'

// ── Types ────────────────────────────────────────────────────
export type Audience  = 'all' | 'students' | 'teachers' | 'parents' | 'staff'
export type Priority  = 'normal' | 'urgent'

export interface Announcement {
  id:         string
  title:      string
  body:       string
  audience:   Audience
  priority:   Priority
  school_id:  string
  posted_by:  string
  created_at: string
  poster_name?: string | null
}

interface Props {
  initialItems: Announcement[]
  userId:       string
  userName:     string
  schoolId:     string
  schoolColor?: string
  /** Role drives which audiences/priorities to show */
  role:         'principal' | 'secretary' | 'teacher'
}

// ── Constants ────────────────────────────────────────────────
const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Everyone', students: 'Students', teachers: 'Teachers',
  parents: 'Parents', staff: 'Staff',
}

const AUDIENCE_COLORS: Record<Audience, { bg: string; text: string; border: string }> = {
  all:      { bg: 'rgba(128,0,32,0.12)',  text: '#cc2244', border: 'rgba(128,0,32,0.25)' },
  students: { bg: 'rgba(36,113,163,0.12)', text: '#2471a3', border: 'rgba(36,113,163,0.25)' },
  teachers: { bg: 'rgba(45,139,85,0.12)', text: '#1e8449', border: 'rgba(45,139,85,0.25)' },
  parents:  { bg: 'rgba(194,123,42,0.12)', text: '#b7770d', border: 'rgba(194,123,42,0.25)' },
  staff:    { bg: 'rgba(107,70,193,0.12)', text: '#6b46c1', border: 'rgba(107,70,193,0.25)' },
}

const BODY_MAX = 1000

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7)  return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
}

// ── Icons ────────────────────────────────────────────────────
const I = {
  Check:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="20 6 9 17 4 12"/></svg>,
  Alert:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  Trash:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/><path d="M10 11v6M14 11v6M9 6V4h6v2"/></svg>,
  Clock:    () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  ChevDown: () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="6 9 12 15 18 9"/></svg>,
  ChevUp:   () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><polyline points="18 15 12 9 6 15"/></svg>,
  Zap:      () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
}

// ── Main Component ───────────────────────────────────────────
export default function AnnouncementsClient({
  initialItems, userId, userName, schoolId, schoolColor = '#800020', role,
}: Props) {
  const supabase = createClient()

  // ── List state ─────────────────────────────────────────────
  const [items,      setItems]      = useState<Announcement[]>(initialItems)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [filterAud,  setFilterAud]  = useState<Audience | 'all'>('all')
  const [confirmDel, setConfirmDel] = useState<Announcement | null>(null)
  const [deleting,   setDeleting]   = useState<string | null>(null)
  const [toast,      setToast]      = useState<{ msg: string; ok: boolean } | null>(null)

  // ── Form state ─────────────────────────────────────────────
  const [title,       setTitle]       = useState('')
  const [body,        setBody]        = useState('')
  const [audience,    setAudience]    = useState<Audience>('all')
  const [priority,    setPriority]    = useState<Priority>('normal')
  const [submitting,  setSubmitting]  = useState(false)
  const [submitState, setSubmitState] = useState<'idle' | 'success' | 'error'>('idle')
  const [submitError, setSubmitError] = useState('')

  const titleRef = useRef<HTMLInputElement>(null)

  // ── Real-time subscription ──────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`announcements:school:${schoolId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'announcements',
        filter: `school_id=eq.${schoolId}`,
      }, (payload) => {
        // Don't duplicate items we just inserted ourselves
        const fresh = payload.new as Announcement
        setItems(prev => {
          if (prev.some(p => p.id === fresh.id)) return prev
          return [{ ...fresh, poster_name: fresh.poster_name ?? userName }, ...prev]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [schoolId, userName])

  // ── Helpers ────────────────────────────────────────────────
  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  function resetForm() {
    setTitle('')
    setBody('')
    setAudience('all')
    setPriority('normal')
    setSubmitState('idle')
    setSubmitError('')
  }

  // ── Submit ─────────────────────────────────────────────────
  async function handleSubmit() {
    const trimTitle = title.trim()
    const trimBody  = body.trim()
    if (!trimTitle || !trimBody) return

    setSubmitting(true)
    setSubmitState('idle')

    const { data, error } = await supabase
      .from('announcements')
      .insert({
        title:     trimTitle,
        body:      trimBody,
        audience,
        priority,
        school_id: schoolId,
        posted_by: userId,   // ← fixes null posted_by error
      })
      .select('id, title, body, audience, priority, school_id, posted_by, created_at')
      .single()

    setSubmitting(false)

    if (error) {
      setSubmitState('error')
      setSubmitError(error.message)
      return
    }

    // Optimistically prepend (real-time may also fire, dedup handled above)
    const newItem: Announcement = {
      ...(data as Announcement),
      poster_name: userName,
    }
    setItems(prev => [newItem, ...prev])
    setSubmitState('success')
    showToast('Announcement published!')
    setTimeout(resetForm, 2000)
  }

  // ── Delete ─────────────────────────────────────────────────
  async function handleDelete(item: Announcement) {
    setDeleting(item.id)
    const { error } = await supabase.from('announcements').delete().eq('id', item.id)
    setDeleting(null)
    if (error) { showToast(error.message, false); return }
    setItems(prev => prev.filter(a => a.id !== item.id))
    setConfirmDel(null)
    if (expandedId === item.id) setExpandedId(null)
    showToast('Announcement deleted')
  }

  // ── Derived ────────────────────────────────────────────────
  const displayed = filterAud === 'all'
    ? items
    : items.filter(a => a.audience === filterAud || a.audience === 'all')

  const urgentCount   = items.filter(a => a.priority === 'urgent').length
  const thisWeekCount = items.filter(a => {
    return (Date.now() - new Date(a.created_at).getTime()) < 7 * 86400000
  }).length

  const isFormValid = title.trim().length > 0 && body.trim().length > 0

  // ── Render ─────────────────────────────────────────────────
  return (
    <div className={styles.wrapper}>

      {/* ── Toast ─────────────────────────────────────────── */}
      {toast && (
        <div className={`${styles.toast} ${toast.ok ? styles.toastOk : styles.toastErr}`}>
          {toast.ok ? '✓' : '✕'} {toast.msg}
        </div>
      )}

      {/* ── Delete Confirm Dialog ─────────────────────────── */}
      {confirmDel && (
        <div className={styles.overlay} onClick={() => setConfirmDel(null)}>
          <div className={styles.dialog} onClick={e => e.stopPropagation()}>
            <h3 className={styles.dialogTitle}>Delete Announcement?</h3>
            <p className={styles.dialogBody}>
              "<strong>{confirmDel.title}</strong>" will be permanently removed from all feeds.
            </p>
            <div className={styles.dialogActions}>
              <button className={styles.dlgCancel} onClick={() => setConfirmDel(null)}>
                Cancel
              </button>
              <button
                className={styles.dlgDelete}
                onClick={() => handleDelete(confirmDel)}
                disabled={deleting === confirmDel.id}
              >
                {deleting === confirmDel.id ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats row ─────────────────────────────────────── */}
      <div className={styles.statsRow}>
        <div className={styles.statCard}>
          <p className={styles.statNum} style={{ color: schoolColor }}>{items.length}</p>
          <p className={styles.statLbl}>Total</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statNum} style={{ color: '#ef4444' }}>{urgentCount}</p>
          <p className={styles.statLbl}>Urgent</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statNum} style={{ color: '#10b981' }}>{thisWeekCount}</p>
          <p className={styles.statLbl}>This Week</p>
        </div>
      </div>

      {/* ── Compose panel (always visible) ───────────────── */}
      <div className={styles.composeCard}>
        <p className={styles.composeTitle}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
          New Announcement
        </p>

        {/* Status feedback */}
        {submitState === 'success' && (
          <div className={styles.feedback} data-type="success">
            <I.Check /> Published successfully!
          </div>
        )}
        {submitState === 'error' && (
          <div className={styles.feedback} data-type="error">
            <I.Alert /> {submitError || 'Failed to publish. Try again.'}
          </div>
        )}

        {/* Title */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Title *</label>
          <input
            ref={titleRef}
            className={styles.fieldInput}
            type="text"
            placeholder="e.g. School Closing Early Tomorrow"
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={120}
            autoComplete="off"
          />
        </div>

        {/* Body */}
        <div className={styles.field}>
          <label className={styles.fieldLabel}>Message *</label>
          <textarea
            className={styles.fieldInput}
            style={{ resize: 'vertical', minHeight: 96, lineHeight: 1.65 }}
            placeholder="Write the full announcement here…"
            value={body}
            onChange={e => setBody(e.target.value)}
            maxLength={BODY_MAX}
            rows={4}
          />
          <span className={`${styles.charCount} ${body.length > BODY_MAX * 0.85 ? styles.charWarn : ''}`}>
            {body.length} / {BODY_MAX}
          </span>
        </div>

        {/* Audience + Priority */}
        <div className={styles.fieldRow}>
          <div className={styles.field}>
            <label className={styles.fieldLabel}>Audience *</label>
            <select
              className={styles.fieldInput}
              value={audience}
              onChange={e => setAudience(e.target.value as Audience)}
            >
              <option value="all">Everyone</option>
              <option value="students">Students only</option>
              <option value="teachers">Teachers only</option>
              <option value="parents">Parents only</option>
              <option value="staff">Staff only</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.fieldLabel}>Priority</label>
            <select
              className={styles.fieldInput}
              value={priority}
              onChange={e => setPriority(e.target.value as Priority)}
            >
              <option value="normal">Normal</option>
              <option value="urgent">🔴 Urgent</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className={styles.composeFooter}>
          <button className={styles.clearBtn} onClick={resetForm} type="button">
            Clear
          </button>
          <button
            className={styles.publishBtn}
            style={{ background: schoolColor }}
            onClick={handleSubmit}
            disabled={!isFormValid || submitting}
            type="button"
          >
            {submitting ? 'Publishing…' : 'Publish Announcement'}
          </button>
        </div>
      </div>

      {/* ── Filter tabs ───────────────────────────────────── */}
      <div className={styles.filterRow}>
        {(['all', 'students', 'teachers', 'parents', 'staff'] as const).map(aud => (
          <button
            key={aud}
            className={`${styles.filterTab} ${filterAud === aud ? styles.filterTabActive : ''}`}
            style={filterAud === aud ? { borderColor: aud === 'all' ? schoolColor : AUDIENCE_COLORS[aud as Audience]?.text, color: aud === 'all' ? schoolColor : AUDIENCE_COLORS[aud as Audience]?.text } : {}}
            onClick={() => setFilterAud(aud)}
          >
            {aud === 'all' ? 'All' : AUDIENCE_LABELS[aud as Audience]}
            {aud === 'all'
              ? <span className={styles.filterCount}>{items.length}</span>
              : <span className={styles.filterCount}>{items.filter(a => a.audience === aud).length}</span>
            }
          </button>
        ))}
      </div>

      {/* ── Announcements list ────────────────────────────── */}
      {displayed.length === 0 ? (
        <div className={styles.empty}>
          <svg viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.2} width={40} height={40}><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
          <p>{filterAud === 'all' ? 'No announcements yet — publish one above.' : `No announcements for ${AUDIENCE_LABELS[filterAud]}.`}</p>
        </div>
      ) : (
        <div className={styles.list}>
          {displayed.map(item => {
            const isExpanded = expandedId === item.id
            const ac = AUDIENCE_COLORS[item.audience]
            const isLong = item.body.length > 160

            return (
              <div
                key={item.id}
                className={`${styles.card} ${item.priority === 'urgent' ? styles.cardUrgent : ''}`}
              >
                {/* Card top: meta + delete */}
                <div className={styles.cardTop}>
                  <div className={styles.cardMeta}>
                    {item.priority === 'urgent' && (
                      <span className={styles.urgentDot} title="Urgent">
                        <I.Zap />
                      </span>
                    )}
                    <span
                      className={styles.audiencePill}
                      style={{ background: ac.bg, color: ac.text, borderColor: ac.border }}
                    >
                      {AUDIENCE_LABELS[item.audience]}
                    </span>
                    <span className={styles.timeMeta}>
                      <I.Clock /> {relativeTime(item.created_at)}
                    </span>
                    {item.poster_name && (
                      <span className={styles.timeMeta} style={{ opacity: 0.7 }}>
                        · {item.poster_name}
                      </span>
                    )}
                  </div>
                  <button
                    className={styles.deleteIconBtn}
                    onClick={() => setConfirmDel(item)}
                    title="Delete announcement"
                    type="button"
                  >
                    <I.Trash />
                  </button>
                </div>

                {/* Title — click to expand */}
                <h3
                  className={styles.cardTitle}
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  style={{ cursor: isLong ? 'pointer' : 'default' }}
                >
                  {item.title}
                </h3>

                {/* Body — clipped or full */}
                <p
                  className={styles.cardBody}
                  style={isExpanded ? { WebkitLineClamp: 'unset', display: 'block' } : {}}
                >
                  {item.body}
                </p>

                {/* Expand toggle */}
                {isLong && (
                  <button
                    className={styles.expandBtn}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    type="button"
                  >
                    {isExpanded ? <><I.ChevUp /> Show less</> : <><I.ChevDown /> Read more</>}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={{ height: 60 }} />
    </div>
  )
}
