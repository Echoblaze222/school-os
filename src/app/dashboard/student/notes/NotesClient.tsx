'use client'
// src/app/dashboard/student/notes/NotesClient.tsx
// FIXES (carried over):
//   1. Query selects `profiles!uploaded_by(full_name)` → returns as `n.author`
//      (explicitly aliased), not `n.profiles`
//   2. Preview modal for typed note content (description/content), not just
//      file downloads
//   3. Filters by visibility: school-wide notes OR class-specific notes
//      matching the student's class — matches exactly what the teacher
//      side writes (visibility is always 'class' + class_id, or could be
//      'school' for school-wide notes)
//
// FIX (this round):
//   - Added visible error banner — previously a failed query failed
//     silently into an empty list.
//   - Guard against profile.class_id being undefined/null when building
//     the .or() filter string — previously this could produce a malformed
//     query string ("class_id.eq.undefined") that either errors or
//     silently matches nothing.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { BookIcon, DownloadIcon } from '@/components/Icons'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function NotesClient({ profile, school, userId }: Props) {
  const [notes,    setNotes]    = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null) // FIX: visible error state
  const [openNote, setOpenNote] = useState<any>(null)
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)

    // FIX: guard against missing class_id — build the filter conditionally
    // instead of interpolating a possibly-undefined value into the query string
    let query = supabase
      .from('school_notes')
      .select('id, title, file_url, description, content, created_at, uploaded_by')
      .eq('school_id', school?.id)

    if (profile?.class_id) {
      query = query.or(`visibility.eq.school,and(visibility.eq.class,class_id.eq.${profile.class_id})`)
    } else {
      // No class assigned — only show school-wide notes
      query = query.eq('visibility', 'school')
    }

    const { data, error: err } = await query.order('created_at', { ascending: false })

    if (err) {
      console.error('[student notes] load error:', err.message)
      setError(err.message)
    }
    if (data) {
      setNotes(data)
      // FIX: fetch author names separately — profiles!uploaded_by join fails
      // because uploaded_by has no FK constraint to profiles in the schema cache
      const uploaderIds = [...new Set(data.map((n: any) => n.uploaded_by).filter(Boolean))]
      if (uploaderIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', uploaderIds)
        if (profiles) {
          const nameMap: Record<string, string> = {}
          profiles.forEach((p: any) => { nameMap[p.id] = p.full_name })
          setNotes(data.map((n: any) => ({ ...n, author: { full_name: nameMap[n.uploaded_by] ?? 'Teacher' } })))
        }
      }
    }
    setLoading(false)
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school} schoolColor={schoolColor} title="School Notes" showBack />
        <main className={styles.main}>

          {/* FIX: visible error banner, dismissible */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: '#EF444415', border: '1px solid #EF444440', borderRadius: 10, marginBottom: 'var(--space-4)' }}>
              <span style={{ fontSize: '0.8rem', color: '#EF4444', flex: 1 }}>⚠️ {error}</span>
              <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 800 }}>✕</button>
            </div>
          )}

          {loading ? <div className={styles.loading}><span /><span /><span /></div>
            : notes.length === 0 ? <div className={styles.empty}><BookIcon size={40} color="var(--text-faint)" strokeWidth={1} /><p>No notes uploaded yet</p></div>
              : <div className={styles.list}>{notes.map(n => {
                const hasText = n.description || n.content
                return (
                  <div key={n.id} className={styles.card}
                    onClick={() => hasText && setOpenNote(n)}
                    style={{ cursor: hasText ? 'pointer' : 'default' }}>
                    <div className={styles.cardIcon} style={{ background: schoolColor + '20' }}><BookIcon size={16} color={schoolColor} /></div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{n.title}</p>
                      <p className={styles.cardMeta}>{n.author?.full_name ?? 'Teacher'} · {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    {n.file_url && (
                      <a href={n.file_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
                        style={{ width: 34, height: 34, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', flexShrink: 0 }}>
                        <DownloadIcon size={15} color="var(--text-muted)" />
                      </a>
                    )}
                  </div>
                )
              })}</div>}
          <div className={styles.spacer} />
        </main>
      </div>

      {/* Preview modal for typed note content */}
      {openNote && (
        <div onClick={() => setOpenNote(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 540, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: '20px 20px 0 0', padding: '20px 20px 32px', maxHeight: '80dvh', overflowY: 'auto' }}>
            <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--glass-border)', margin: '0 auto 16px' }} />
            <p style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1rem', marginBottom: 4 }}>{openNote.title}</p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: 16 }}>
              {openNote.author?.full_name ?? 'Teacher'} · {new Date(openNote.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {openNote.description || openNote.content}
            </p>
            {openNote.file_url && (
              <a href={openNote.file_url} target="_blank" rel="noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: schoolColor + '18', border: `1px solid ${schoolColor}40`, borderRadius: 10, textDecoration: 'none', color: schoolColor, fontWeight: 700, fontSize: '0.85rem', marginTop: 12 }}>
                📎 Open Attachment
              </a>
            )}
            <button onClick={() => setOpenNote(null)}
              style={{ width: '100%', height: 42, marginTop: 16, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
  }
          
