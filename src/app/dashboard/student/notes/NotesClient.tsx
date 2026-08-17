'use client'
// src/app/dashboard/student/notes/NotesClient.tsx
//
// UPGRADE (this round):
//   1. Uploaded files (PDF/Word/PPT) now open in an in-portal
//      DocumentViewer modal instead of a raw new-tab download link.
//   2. Typed/pasted notes now render as a cinematic 3D flip-book
//      (NoteBook component) instead of a plain scrolling text modal —
//      the content is auto-paginated into "slides" client-side.
//   3. Card badge shows "Read" for text notes and "View" for files
//      so students know what tapping will do before they tap.
//
// FIXES (carried over from previous round):
//   1. Query selects `profiles!uploaded_by(full_name)` → returns as `n.author`
//      (explicitly aliased), not `n.profiles`
//   2. Filters by visibility: school-wide notes OR class-specific notes
//      matching the student's class
//   3. Visible error banner on failed load
//   4. Guard against profile.class_id being undefined/null when building
//      the .or() filter string
//
// REDESIGN PASS (Lane 3 — Student): RolePageWrapper chrome, emoji → Icons,
// brand fallback fixed, glass-card/motion treatment to match main dashboard.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BookIcon, AlertIcon, XIcon, FileTextIcon, BookOpenIcon } from '@/components/Icons'
import NoteBook from '@/components/NoteBook'
import DocumentViewer from '@/components/DocumentViewer'
import motion from '@/components/dashboard-motion.module.css'
import styles from './page.module.css'
import { SkeletonList } from '@/components/motion/Skeleton'

interface Props { profile: any; school: any; userId: string }

export default function NotesClient({ profile, school, userId }: Props) {
  const [notes,    setNotes]    = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [openBook, setOpenBook] = useState<any>(null)   // typed note → 3D flip-book
  const [openDoc,  setOpenDoc]  = useState<any>(null)   // uploaded file → in-portal viewer
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#800020'

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    setError(null)

    let query = supabase
      .from('school_notes')
      .select('id, title, file_url, description, content, created_at, uploaded_by')
      .eq('school_id', school?.id)

    if (profile?.class_id) {
      query = query.or(`visibility.eq.school,and(visibility.eq.class,class_id.eq.${profile.class_id})`)
    } else {
      query = query.eq('visibility', 'school')
    }

    const { data, error: err } = await query.order('created_at', { ascending: false })

    if (err) {
      console.error('[student notes] load error:', err.message)
      setError(err.message)
    }
    if (data) {
      setNotes(data)
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

  function handleCardClick(n: any) {
    if (n.file_url) {
      setOpenDoc(n)
    } else if (n.description || n.content) {
      setOpenBook(n)
    }
  }

  return (
    <RolePageWrapper userId={userId} role="student" profile={profile} school={school} title="School Notes">
        <>

          {error && (
            <div className={`glass-card ${motion.riseIn}`} style={{ display: 'flex', alignItems: 'center', gap: 8,
              padding: '10px 14px', background: 'var(--danger-subtle)', borderColor: 'rgba(239,68,68,0.3)',
              marginBottom: 'var(--space-4)' }}>
              <AlertIcon size={16} color="var(--danger)" />
              <span style={{ fontSize: '0.8rem', color: 'var(--danger)', flex: 1 }}>{error}</span>
              <button onClick={() => setError(null)} className={motion.pressable}
                style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', display: 'flex', padding: 4 }}>
                <XIcon size={14} />
              </button>
            </div>
          )}

          {loading
            ? <SkeletonList count={3} variant="card" />
            : notes.length === 0
              ? <div className={`${styles.empty} ${motion.riseIn}`}>
                  <BookIcon size={40} color="var(--text-faint)" strokeWidth={1} />
                  <p>No notes uploaded yet</p>
                </div>
              : <div className={styles.list}>{notes.map((n, i) => {
                  const hasText   = n.description || n.content
                  const clickable = hasText || n.file_url
                  return (
                    <div key={n.id} className={`glass-card ${styles.card} ${motion.staggerItem} ${clickable ? motion.pressable : ''}`}
                      onClick={() => clickable && handleCardClick(n)}
                      style={{ cursor: clickable ? 'pointer' : 'default', animationDelay: `${i * 40}ms` }}>
                      <div className={styles.cardIcon} style={{ background: 'var(--brand-subtle)' }}>
                        <BookIcon size={16} color={schoolColor} />
                      </div>
                      <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>{n.title}</p>
                        <p className={styles.cardMeta}>{n.author?.full_name ?? 'Teacher'} · {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                      </div>
                      {clickable && (
                        <span className={styles.badge} style={{ background: 'var(--brand-subtle)', color: schoolColor,
                          flexShrink: 0, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {n.file_url ? <><FileTextIcon size={11} /> View</> : <><BookOpenIcon size={11} /> Read</>}
                        </span>
                      )}
                    </div>
                  )
                })}</div>}
          <div className={styles.spacer} />
        </>

      {/* Typed/pasted note → cinematic 3D flip-book */}
      {openBook && (
        <NoteBook
          title={openBook.title}
          content={openBook.description || openBook.content || ''}
          accentColor={schoolColor}
          onClose={() => setOpenBook(null)}
        />
      )}

      {/* Uploaded PDF/Word/PPT → in-portal document viewer */}
      {openDoc && (
        <DocumentViewer
          fileUrl={openDoc.file_url}
          title={openDoc.title}
          accentColor={schoolColor}
          onClose={() => setOpenDoc(null)}
        />
      )}
    </RolePageWrapper>
  )
}
