'use client'
// FIXED: Complete redesign — topic tracker (syllabus_topics table) + PDF upload per term
// Resolved class_subject_id from class_teachers, correct schema columns

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BookOpenIcon, PlusIcon, CheckCircleIcon, DownloadIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/records/page.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id: string
  class_name: string
  subject: string | null
  class_subject_id: string | null
}

const TERMS = ['1st Term', '2nd Term', '3rd Term']
const CURRENT_YEAR = new Date().getFullYear()
const ACADEMIC_YEAR = `${CURRENT_YEAR}/${CURRENT_YEAR + 1}`

export default function SyllabusClient({ profile, school, userId }: Props) {
  const [teacherClasses, setTeacherClasses] = useState<TeacherClass[]>([])
  const [selectedClass, setSelectedClass] = useState<TeacherClass | null>(null)
  const [term, setTerm] = useState('1st Term')
  const [topics, setTopics] = useState<any[]>([])
  const [syllabusPdf, setSyllabusPdf] = useState<any | null>(null)
  const [loading, setLoading] = useState(true)
  const [showAddTopic, setShowAddTopic] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [tab, setTab] = useState<'topics' | 'pdf'>('topics')
  const [newTopic, setNewTopic] = useState({ title: '', description: '', week_number: 1 })
  const pdfRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()
  const sc = school?.primary_color ?? '#7C3AED'

  useEffect(() => { loadTeacherClasses() }, [])
  useEffect(() => {
    if (selectedClass) {
      loadTopics()
      loadSyllabusPdf()
    }
  }, [selectedClass, term])

  async function loadTeacherClasses() {
    setLoading(true)
    const { data: ct } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school?.id)

    if (!ct?.length) { setLoading(false); return }

    const list: TeacherClass[] = await Promise.all(
      ct.map(async (row: any) => {
        const { data: cs } = await supabase
          .from('class_subjects')
          .select('id')
          .eq('class_id', row.class_id)
          .limit(1)
          .maybeSingle()
        return {
          class_id: row.class_id,
          class_name: row.classes?.name ?? '',
          subject: row.subject,
          class_subject_id: cs?.id ?? null,
        }
      })
    )
    setTeacherClasses(list)
    setSelectedClass(list[0])
    setLoading(false)
  }

  async function loadTopics() {
    if (!selectedClass?.class_subject_id) { setTopics([]); return }
    const { data } = await supabase
      .from('syllabus_topics')
      .select('id, title, description, week_number, is_covered, covered_at')
      .eq('class_subject_id', selectedClass.class_subject_id)
      .eq('term', term)
      .eq('school_id', school?.id)
      .order('week_number')
    if (data) setTopics(data)
  }

  async function loadSyllabusPdf() {
    if (!selectedClass?.class_id) return
    const { data } = await supabase
      .from('syllabus')
      .select('id, file_url, created_at')
      .eq('class_id', selectedClass.class_id)
      .eq('term', term)
      .eq('academic_year', ACADEMIC_YEAR)
      .maybeSingle()
    setSyllabusPdf(data ?? null)
  }

  async function addTopic() {
    if (!newTopic.title || !selectedClass?.class_subject_id) return
    setSaving(true)
    await supabase.from('syllabus_topics').insert({
      class_subject_id: selectedClass.class_subject_id,
      title: newTopic.title,
      description: newTopic.description,
      week_number: newTopic.week_number,
      term,
      academic_year: ACADEMIC_YEAR,
      school_id: school?.id,
      created_by: userId,
      is_covered: false,
    })
    setNewTopic({ title: '', description: '', week_number: topics.length + 2 })
    setShowAddTopic(false)
    loadTopics()
    setSaving(false)
  }

  async function toggleCovered(id: string, current: boolean) {
    await supabase.from('syllabus_topics').update({
      is_covered: !current,
      covered_at: !current ? new Date().toISOString() : null,
    }).eq('id', id)
    setTopics(prev => prev.map(t =>
      t.id === id ? { ...t, is_covered: !current, covered_at: !current ? new Date().toISOString() : null } : t
    ))
  }

  async function deleteTopic(id: string) {
    await supabase.from('syllabus_topics').delete().eq('id', id)
    setTopics(prev => prev.filter(t => t.id !== id))
  }

  async function uploadSyllabusPdf(file: File) {
    setUploadingPdf(true)
    const ext = file.name.split('.').pop()
    const path = `${school?.id}/${selectedClass?.class_id}/${term.replace(/ /g, '_')}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('syllabus').upload(path, file, { upsert: true })
    if (upErr) { console.error(upErr); setUploadingPdf(false); return }
    const { data: urlData } = supabase.storage.from('syllabus').getPublicUrl(path)
    const fileUrl = urlData?.publicUrl ?? ''

    // Upsert into syllabus table (one per class+term+year)
    if (syllabusPdf?.id) {
      await supabase.from('syllabus').update({ file_url: fileUrl }).eq('id', syllabusPdf.id)
    } else {
      await supabase.from('syllabus').insert({
        class_id: selectedClass?.class_id,
        term,
        academic_year: ACADEMIC_YEAR,
        file_url: fileUrl,
        uploaded_by: userId,
      })
    }
    loadSyllabusPdf()
    setUploadingPdf(false)
  }

  const covered = topics.filter(t => t.is_covered).length
  const total = topics.length
  const pct = total > 0 ? Math.round((covered / total) * 100) : 0

  if (loading) return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Syllabus">
      <div className={styles.loading}><span /><span /><span /></div>
    </RolePageWrapper>
  )

  if (!teacherClasses.length) return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Syllabus">
      <div className={styles.empty}>
        <BookOpenIcon size={40} color="var(--text-faint)" strokeWidth={1} />
        <p>No classes assigned yet.</p>
      </div>
    </RolePageWrapper>
  )

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Syllabus">

      {/* Class pills */}
      {teacherClasses.length > 1 && (
        <div style={{ overflowX: 'auto', display: 'flex', gap: 8, marginBottom: 'var(--space-4)', paddingBottom: 4 }}>
          {teacherClasses.map(cls => (
            <button key={cls.class_id} onClick={() => setSelectedClass(cls)}
              style={{ flexShrink: 0, padding: '6px 14px', borderRadius: 999, border: `1px solid ${selectedClass?.class_id === cls.class_id ? sc : sc + '40'}`, background: selectedClass?.class_id === cls.class_id ? sc : 'transparent', color: selectedClass?.class_id === cls.class_id ? '#fff' : sc, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {cls.class_name}{cls.subject ? ` · ${cls.subject}` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Term tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)' }}>
        {TERMS.map(t => (
          <button key={t} onClick={() => setTerm(t)}
            style={{ padding: '6px 14px', borderRadius: 999, border: `1px solid ${term === t ? sc : 'var(--glass-border)'}`, background: term === t ? sc : 'transparent', color: term === t ? '#fff' : 'var(--text-muted)', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer' }}>
            {t}
          </button>
        ))}
      </div>

      {/* Mode tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-5)' }}>
        {(['topics', 'pdf'] as const).map(m => (
          <button key={m} onClick={() => setTab(m)}
            style={{ flex: 1, height: 36, borderRadius: 8, border: `1px solid ${tab === m ? sc : 'var(--glass-border)'}`, background: tab === m ? sc + '20' : 'transparent', color: tab === m ? sc : 'var(--text-muted)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
            {m === 'topics' ? '📋 Topic Tracker' : '📄 Syllabus PDF'}
          </button>
        ))}
      </div>

      {/* ── TOPICS TAB ──────────────────────────────────────────── */}
      {tab === 'topics' && (
        <>
          {/* Progress bar */}
          {total > 0 && (
            <div style={{ marginBottom: 'var(--space-5)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Coverage</span>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: sc }}>{covered}/{total} topics · {pct}%</span>
              </div>
              <div style={{ height: 6, background: 'var(--glass-bg)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: pct >= 80 ? '#10B981' : pct >= 50 ? sc : '#F59E0B', borderRadius: 999, transition: 'width 0.4s ease' }} />
              </div>
            </div>
          )}

          {/* Add topic button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 'var(--space-3)' }}>
            <button onClick={() => setShowAddTopic(!showAddTopic)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '7px 14px', background: sc, color: '#fff', border: 'none', borderRadius: 999, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
              <PlusIcon size={13} color="white" /> Add Topic
            </button>
          </div>

          {/* Add topic form */}
          {showAddTopic && (
            <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Topic Title *</label>
                  <input value={newTopic.title} onChange={e => setNewTopic(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Photosynthesis"
                    style={{ height: 38, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Week</label>
                  <input type="number" min={1} max={20} value={newTopic.week_number}
                    onChange={e => setNewTopic(p => ({ ...p, week_number: Number(e.target.value) }))}
                    style={{ width: 70, height: 38, padding: '0 10px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 'var(--space-3)' }}>
                <label style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Description (optional)</label>
                <textarea value={newTopic.description} onChange={e => setNewTopic(p => ({ ...p, description: e.target.value }))}
                  placeholder="Brief notes on this topic..." rows={2}
                  style={{ padding: '8px 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none', resize: 'none' }} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addTopic} disabled={saving || !newTopic.title}
                  style={{ flex: 1, height: 38, background: sc, color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
                  {saving ? 'Adding...' : 'Add Topic'}
                </button>
                <button onClick={() => setShowAddTopic(false)}
                  style={{ height: 38, padding: '0 14px', background: 'transparent', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer' }}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Topics list */}
          {!selectedClass?.class_subject_id ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              ⚠️ No subject assigned to this class yet. Ask the principal to set up class subjects.
            </div>
          ) : topics.length === 0 ? (
            <div className={styles.empty}>
              <BookOpenIcon size={38} color="var(--text-faint)" strokeWidth={1} />
              <p>No topics yet for {term}. Add your first topic.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {topics.map(topic => (
                <div key={topic.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: topic.is_covered ? '#10B98108' : 'var(--glass-bg)', border: `1px solid ${topic.is_covered ? '#10B98130' : 'var(--glass-border)'}`, borderRadius: 10, transition: 'all 0.15s' }}>
                  <button onClick={() => toggleCovered(topic.id, topic.is_covered)}
                    style={{ width: 22, height: 22, borderRadius: '50%', border: `2px solid ${topic.is_covered ? '#10B981' : 'var(--glass-border)'}`, background: topic.is_covered ? '#10B981' : 'transparent', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s', padding: 0 }}>
                    {topic.is_covered && <CheckCircleIcon size={12} color="white" />}
                  </button>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: '0 0 2px', fontWeight: 600, color: topic.is_covered ? 'var(--text-muted)' : 'var(--text-primary)', fontSize: '0.88rem', textDecoration: topic.is_covered ? 'line-through' : 'none' }}>
                      Wk {topic.week_number} · {topic.title}
                    </p>
                    {topic.description && (
                      <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.description}</p>
                    )}
                  </div>
                  {topic.is_covered && topic.covered_at && (
                    <span style={{ fontSize: '0.62rem', color: '#10B981', fontWeight: 600, flexShrink: 0 }}>
                      {new Date(topic.covered_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  )}
                  <button onClick={() => deleteTopic(topic.id)}
                    style={{ padding: '3px 8px', borderRadius: 999, border: '1px solid #EF444430', background: 'transparent', color: '#EF4444', fontSize: '0.65rem', fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── PDF TAB ─────────────────────────────────────────────── */}
      {tab === 'pdf' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
            Upload the official {term} syllabus PDF for <strong>{selectedClass?.class_name}</strong>.
            Students can download it from their portal.
          </p>

          <input ref={pdfRef} type="file" accept=".pdf,.doc,.docx" onChange={e => { const f = e.target.files?.[0]; if (f) uploadSyllabusPdf(f) }} style={{ display: 'none' }} />

          {syllabusPdf ? (
            <div style={{ padding: 'var(--space-5)', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: sc + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <BookOpenIcon size={20} color={sc} />
                </div>
                <div>
                  <p style={{ margin: '0 0 2px', fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{term} Syllabus</p>
                  <p style={{ margin: 0, fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {selectedClass?.class_name} · {ACADEMIC_YEAR}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <a href={syllabusPdf.file_url} target="_blank" rel="noreferrer"
                  style={{ flex: 1, height: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, background: sc + '20', border: `1px solid ${sc}40`, borderRadius: 8, color: sc, fontWeight: 700, fontSize: '0.8rem', textDecoration: 'none' }}>
                  <DownloadIcon size={14} color={sc} /> View PDF
                </a>
                <button onClick={() => pdfRef.current?.click()} disabled={uploadingPdf}
                  style={{ flex: 1, height: 38, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 8, color: 'var(--text-secondary)', fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer' }}>
                  {uploadingPdf ? 'Uploading...' : 'Replace PDF'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => pdfRef.current?.click()} disabled={uploadingPdf}
              style={{ width: '100%', height: 100, border: `2px dashed ${sc}50`, borderRadius: 12, background: sc + '08', color: sc, fontWeight: 600, fontSize: '0.88rem', cursor: 'pointer' }}>
              {uploadingPdf ? 'Uploading...' : `📄 Upload ${term} Syllabus PDF`}
            </button>
          )}
        </div>
      )}

      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )
}
