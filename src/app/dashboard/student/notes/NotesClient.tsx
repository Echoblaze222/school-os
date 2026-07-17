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

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { BookIcon } from '@/components/Icons'
import NoteBook from '@/components/NoteBook'
import DocumentViewer from '@/components/DocumentViewer'
import styles from './page.module.css'

interface Props { profile: any; school: any; userId: string }

export default function NotesClient({ profile, school, userId }: Props) {
  const [notes,    setNotes]    = useState<any[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState<string | null>(null)
  const [openBook, setOpenBook] = useState<any>(null)   // typed note → 3D flip-book
  const [openDoc,  setOpenDoc]  = useState<any>(null)   // uploaded file → in-portal viewer
  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'

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
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school} schoolColor={schoolColor} title="School Notes" showBack />
        <main className={styles.main}>

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
                const clickable = hasText || n.file_url
                return (
                  <div key={n.id} className={styles.card}
                    onClick={() => clickable && handleCardClick(n)}
                    style={{ cursor: clickable ? 'pointer' : 'default' }}>
                    <div className={styles.cardIcon} style={{ background: schoolColor + '20' }}><BookIcon size={16} color={schoolColor} /></div>
                    <div className={styles.cardBody}>
                      <p className={styles.cardTitle}>{n.title}</p>
                      <p className={styles.cardMeta}>{n.author?.full_name ?? 'Teacher'} · {new Date(n.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                    </div>
                    {clickable && (
                      <span style={{
                        padding: '4px 10px', borderRadius: 999, fontSize: '0.65rem', fontWeight: 700,
                        background: schoolColor + '18', color: schoolColor, flexShrink: 0, whiteSpace: 'nowrap',
                      }}>
                        {n.file_url ? '📄 View' : '📖 Read'}
                      </span>
                    )}
                  </div>
                )
              })}</div>}
          <div className={styles.spacer} />
        </main>
      </div>

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
    </div>
  )
}
