'use client'
// ─────────────────────────────────────────────────────────────
//  AnnouncementsViewer.tsx
//  Read-only feed used by: student, teacher, parent, bursar
//
//  FIXES:
//   ✓ Click to read full message works — expand/collapse inline
//   ✓ Real-time subscription — new posts appear without refresh
//   ✓ Audience filtering (viewer only sees relevant notices)
//   ✓ Urgent items pinned visually to top of list
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import styles from './viewer.module.css'

// ── Types ────────────────────────────────────────────────────
type Audience = 'all' | 'students' | 'teachers' | 'parents' | 'staff'
type Priority = 'normal' | 'urgent'

interface Announcement {
  id:          string
  title:       string
  body:        string
  audience:    Audience
  priority:    Priority
  created_at:  string
  poster_name?: string | null
}

interface Props {
  initialItems:  Announcement[]
  schoolId:      string
  /** Viewer's role — used to filter announcements */
  viewerAudience: Audience | 'all'
}

// ── Constants ─────────────────────────────────────────────────
const AUDIENCE_COLORS: Record<Audience, { bg: string; text: string; border: string }> = {
  all:      { bg: 'rgba(128,0,32,0.10)',   text: '#cc2244', border: 'rgba(128,0,32,0.20)' },
  students: { bg: 'rgba(36,113,163,0.10)', text: '#2471a3', border: 'rgba(36,113,163,0.20)' },
  teachers: { bg: 'rgba(45,139,85,0.10)',  text: '#1e8449', border: 'rgba(45,139,85,0.20)' },
  parents:  { bg: 'rgba(194,123,42,0.10)', text: '#b7770d', border: 'rgba(194,123,42,0.20)' },
  staff:    { bg: 'rgba(107,70,193,0.10)', text: '#6b46c1', border: 'rgba(107,70,193,0.20)' },
}

const AUDIENCE_LABELS: Record<Audience, string> = {
  all: 'Everyone', students: 'Students', teachers: 'Teachers',
  parents: 'Parents', staff: 'Staff',
}

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

// ── Component ─────────────────────────────────────────────────
export default function AnnouncementsViewer({
  initialItems, schoolId, viewerAudience,
}: Props) {
  const supabase = createClient()

  const [items,      setItems]      = useState<Announcement[]>(initialItems)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // ── Real-time: new announcements appear instantly ──────────
  useEffect(() => {
    const channel = supabase
      .channel(`announcements:viewer:${schoolId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'announcements',
        filter: `school_id=eq.${schoolId}`,
      }, (payload) => {
        const fresh = payload.new as Announcement
        // Only show if this viewer's audience is targeted
        if (
          fresh.audience === 'all' ||
          fresh.audience === viewerAudience ||
          viewerAudience === 'all'
        ) {
          setItems(prev => {
            if (prev.some(p => p.id === fresh.id)) return prev
            return [fresh, ...prev]
          })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [schoolId, viewerAudience])

  // Filter: show announcements addressed to this viewer
  const displayed = items.filter(a =>
    a.audience === 'all' ||
    a.audience === viewerAudience ||
    viewerAudience === 'all'
  )

  // Sort: urgent first, then by date
  const sorted = [...displayed].sort((a, b) => {
    if (a.priority === 'urgent' && b.priority !== 'urgent') return -1
    if (b.priority === 'urgent' && a.priority !== 'urgent') return  1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  if (sorted.length === 0) {
    return (
      <div className={styles.empty}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} width={36} height={36} opacity={0.4}>
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        <p>No announcements yet</p>
      </div>
    )
  }

  return (
    <div className={styles.list}>
      {sorted.map(item => {
        const isExpanded = expandedId === item.id
        const isLong     = item.body.length > 180
        const ac         = AUDIENCE_COLORS[item.audience]

        return (
          <div
            key={item.id}
            className={`${styles.card} ${item.priority === 'urgent' ? styles.cardUrgent : ''}`}
          >
            {/* Meta row */}
            <div className={styles.metaRow}>
              {item.priority === 'urgent' && (
                <span className={styles.urgentBadge}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} width={10} height={10}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  Urgent
                </span>
              )}
              <span
                className={styles.audiencePill}
                style={{ background: ac.bg, color: ac.text, borderColor: ac.border }}
              >
                {AUDIENCE_LABELS[item.audience]}
              </span>
              <span className={styles.timeMeta}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={10} height={10}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                {relativeTime(item.created_at)}
              </span>
            </div>

            {/* Title — tappable to expand */}
            <h3
              className={styles.cardTitle}
              onClick={() => isLong && setExpandedId(isExpanded ? null : item.id)}
              style={{ cursor: isLong ? 'pointer' : 'default' }}
            >
              {item.title}
            </h3>

            {/* Body — clipped unless expanded */}
            <p
              className={styles.cardBody}
              style={isExpanded ? { WebkitLineClamp: 'unset', display: 'block' } : {}}
            >
              {item.body}
            </p>

            {/* Expand / collapse */}
            {isLong && (
              <button
                className={styles.expandBtn}
                onClick={() => setExpandedId(isExpanded ? null : item.id)}
                type="button"
              >
                {isExpanded
                  ? <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><polyline points="18 15 12 9 6 15"/></svg>
                      Show less
                    </>
                  : <>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><polyline points="6 9 12 15 18 9"/></svg>
                      Read more
                    </>
                }
              </button>
            )}

            {/* Posted by */}
            {item.poster_name && (
              <p className={styles.postedBy}>— {item.poster_name}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
