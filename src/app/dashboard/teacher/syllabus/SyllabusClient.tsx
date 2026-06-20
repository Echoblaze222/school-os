'use client'
// FIXED:
// 1. syllabus INSERT now includes school_id (was missing — caused RLS rejection)
// 2. class_subject_id lookup filters by subject to avoid wrong row
// 3. addTopic() surfaces Supabase error instead of silently failing
// 4. Edit topic inline: click pencil icon to edit title/description/week
// 5. Error banner shown for all DB failures
// 6. school_id guard before queries

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'
import { BookOpenIcon, PlusIcon, CheckCircleIcon, DownloadIcon } from '@/components/Icons'
import styles from './syllabus.module.css'

interface Props { profile: any; school: any; userId: string }

interface TeacherClass {
  class_id: string
  class_name: string
  subject: string | null
  class_subject_id: string | null
}

interface Topic {
  id: string
  title: string
  description: string | null
  week_number: number
  is_covered: boolean
  covered_at: string | null
}

const TERMS = ['First Term', 'Second Term', 'Third Term']
const CURRENT_YEAR = new Date().getFullYear()
const ACADEMIC_YEAR = `${CURRENT_YEAR}/${CURRENT_YEAR + 1}`

export default function SyllabusClient({ profile, school, userId }: Props) {
  const [teacherClasses,  setTeacherClasses]  = useState<TeacherClass[]>([])
  const [selectedClass,   setSelectedClass]   = useState<TeacherClass | null>(null)
  const [term,            setTerm]            = useState('First Term')
  const [topics,          setTopics]          = useState<Topic[]>([])
  const [syllabusPdf,     setSyllabusPdf]     = useState<any | null>(null)
  const [loading,         setLoading]         = useState(true)
  const [showAddTopic,    setShowAddTopic]    = useState(false)
  const [saving,          setSaving]          = useState(false)
  const [uploadingPdf,    setUploadingPdf]    = useState(false)
  const [tab,             setTab]             = useState<'topics' | 'pdf'>('topics')
  const [newTopic,        setNewTopic]        = useState({ title: '', description: '', week_number: 1 })
  const [editTopicId,     setEditTopicId]     = useState<string | null>(null)
  const [editTopic,       setEditTopic]       = useState({ title: '', description: '', week_number: 1 })
  const [error,           setError]           = useState<string | null>(null)
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
    if (!school?.id) { setLoading(false); return }
    setLoading(true)
    const { data: ct, error: err } = await supabase
      .from('class_teachers')
      .select('class_id, subject, classes(name)')
      .eq('teacher_id', userId)
      .eq('school_id', school.id)

    if (err) { setError(err.message); setLoading(false); return }
    if (!ct?.length) { setLoading(false); return }

    const list: TeacherClass[] = await Promise.all(
      ct.map(async (row: any) => {
        // FIXED: filter by subject too so we get the RIGHT class_subject record
        let q = supabase
          .from('class_subjects')
          .select('id')
          .eq('class_id', row.class_id)
        if (row.subject) q = q.eq('subject', row.subject)
        const { data: cs } = await q.limit(1).maybeSingle()
        return {
          class_id: row.class_id,
          class_name: row.classes?.name ?? '',
          subject: row.subject,
          class_subject_id: cs?.id ?? null,
        }
      })
    )
    setTeacherClasses(list)
    setSelectedClass(list[0] ?? null)
    setLoading(false)
  }

  async function loadTopics() {
    if (!selectedClass?.class_subject_id || !school?.id) { setTopics([]); return }
    const { data, error: err } = await supabase
      .from('syllabus_topics')
      .select('id, title, description, week_number, is_covered, covered_at')
      .eq('class_subject_id', selectedClass.class_subject_id)
      .eq('term', term)
      .eq('school_id', school.id)
      .order('week_number')
    if (err) { setError(err.message); return }
    setTopics(data ?? [])
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
    if (!newTopic.title.trim()) { setError('Topic title is required'); return }
    if (!selectedClass?.class_subject_id) { setError('No subject linked to this class'); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('syllabus_topics').insert({
      class_subject_id: selectedClass.class_subject_id,
      title: newTopic.title,
      description: newTopic.description || null,
      week_number: newTopic.week_number,
      term,
      academic_year: ACADEMIC_YEAR,
      school_id: school?.id,
      created_by: userId,
      is_covered: false,
    })
    if (err) { setError(err.message); setSaving(false); return }
    setNewTopic({ title: '', description: '', week_number: topics.length + 2 })
    setShowAddTopic(false)
    await loadTopics()
    setSaving(false)
  }

  async function saveEditTopic() {
    if (!editTopicId || !editTopic.title.trim()) { setError('Title is required'); return }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('syllabus_topics').update({
      title: editTopic.title,
      description: editTopic.description || null,
      week_number: editTopic.week_number,
    }).eq('id', editTopicId)
    if (err) { setError(err.message); setSaving(false); return }
    setTopics(prev => prev.map(t =>
      t.id === editTopicId
        ? { ...t, title: editTopic.title, description: editTopic.description || null, week_number: editTopic.week_number }
        : t
    ))
    setEditTopicId(null)
    setSaving(false)
  }

  async function toggleCovered(id: string, current: boolean) {
    const { error: err } = await supabase.from('syllabus_topics').update({
      is_covered: !current,
      covered_at: !current ? new Date().toISOString() : null,
    }).eq('id', id)
    if (err) { setError(err.message); return }
    setTopics(prev => prev.map(t =>
      t.id === id ? { ...t, is_covered: !current, covered_at: !current ? new Date().toISOString() : null } : t
    ))
  }

  async function deleteTopic(id: string) {
    if (!confirm('Delete this topic?')) return
    const { error: err } = await supabase.from('syllabus_topics').delete().eq('id', id)
    if (err) { setError(err.message); return }
    setTopics(prev => prev.filter(t => t.id !== id))
  }

  async function uploadSyllabusPdf(file: File) {
    if (!selectedClass?.class_id) return
    setUploadingPdf(true)
    setError(null)
    const ext = file.name.split('.').pop()
    const path = `${school?.id}/${selectedClass.class_id}/${term.replace(/ /g, '_')}_${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('syllabus').upload(path, file, { upsert: true })
    if (upErr) { setError(`Upload failed: ${upErr.message}`); setUploadingPdf(false); return }
    const { data: urlData } = supabase.storage.from('syllabus').getPublicUrl(path)
    const fileUrl = urlData?.publicUrl ?? ''

    if (syllabusPdf?.id) {
      const { error: err } = await supabase.from('syllabus').update({ file_url: fileUrl }).eq('id', syllabusPdf.id)
      if (err) { setError(err.message); setUploadingPdf(false); return }
    } else {
      // FIXED: added school_id — it's required by RLS
      const { error: err } = await supabase.from('syllabus').insert({
        class_id: selectedClass.class_id,
        term,
        academic_year: ACADEMIC_YEAR,
        file_url: fileUrl,
        uploaded_by: userId,
        school_id: school?.id,
      })
      if (err) { setError(err.message); setUploadingPdf(false); return }
    }
    await loadSyllabusPdf()
    setUploadingPdf(false)
  }

  const covered = topics.filter(t => t.is_covered).length
  const total   = topics.length
  const pct     = total > 0 ? Math.round((covered / total) * 100) : 0

  if (loading) return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="Syllabus">
      <div className={styles.loader}><span /><span /><span /></div>
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
        <div className={styles.classPills}>
          {teacherClasses.map(cls => (
            <button key={cls.class_id} onClick={() => setSelectedClass(cls)}
              className={styles.classPill}
              style={{
                border: `1px solid ${selectedClass?.class_id === cls.class_id ? sc : sc + '40'}`,
                background: selectedClass?.class_id === cls.class_id ? sc : 'transparent',
                color: selectedClass?.class_id === cls.class_id ? '#fff' : sc,
              }}>
              {cls.class_name}{cls.subject ? ` · ${cls.subject}` : ''}
            </button>
          ))}
        </div>
      )}

      {/* Term tabs */}
      <div className={styles.termTabs}>
        {TERMS.map(t => (
          <button key={t} onClick={() => setTerm(t)}
            className={styles.termTab}
            style={{
              border: `1px solid ${term === t ? sc : 'var(--glass-border)'}`,
              background: term === t ? sc : 'transparent',
              color: term === t ? '#fff' : 'var(--text-muted)',
            }}>
            {t}
          </button>
        ))}
      </div>

      {/* Mode tabs */}
      <div className={styles.modeTabs}>
        {(['topics', 'pdf'] as const).map(m => (
          <button key={m} onClick={() => setTab(m)}
            className={styles.modeTab}
            style={{
              border: `1px solid ${tab === m ? sc : 'var(--glass-border)'}`,
              background: tab === m ? sc + '20' : 'transparent',
              color: tab === m ? sc : 'var(--text-muted)',
            }}>
            {m === 'topics' ? '📋 Topic Tracker' : '📄 Syllabus PDF'}
          </button>
        ))}
      </div>

      {/* Error banner */}
      {error && (
        <div className={styles.errorBanner}>
          ⚠️ {error}
          <button onClick={() => setError(null)} className={styles.errorClose}>✕</button>
        </div>
      )}

      {/* ── TOPICS TAB ──────────────────────────────────────── */}
      {tab === 'topics' && (
        <>
          {total > 0 && (
            <div className={styles.progressWrap}>
              <div className={styles.progressHeader}>
                <span className={styles.progressLabel}>Coverage</span>
                <span className={styles.progressStat} style={{ color: sc }}>
                  {covered}/{total} topics · {pct}%
                </span>
              </div>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill}
                  style={{ width: `${pct}%`, background: pct >= 80 ? '#10B981' : pct >= 50 ? sc : '#F59E0B' }} />
              </div>
            </div>
          )}

          <div className={styles.addTopicRow}>
            <button onClick={() => { setShowAddTopic(!showAddTopic); setEditTopicId(null) }}
              className={styles.addBtn} style={{ background: sc }}>
              <PlusIcon size={13} color="white" /> Add Topic
            </button>
          </div>

          {/* Add form */}
          {showAddTopic && (
            <div className={styles.formCard}>
              <div className={styles.addTopicGrid}>
                <div className={styles.fieldWrap} style={{ flex: 1 }}>
                  <label className={styles.fieldLabel}>Topic Title *</label>
                  <input value={newTopic.title}
                    onChange={e => setNewTopic(p => ({ ...p, title: e.target.value }))}
                    placeholder="e.g. Photosynthesis"
                    className={styles.input} />
                </div>
                <div className={styles.fieldWrap} style={{ width: 80 }}>
                  <label className={styles.fieldLabel}>Week</label>
                  <input type="number" min={1} max={20}
                    value={newTopic.week_number}
                    onChange={e => setNewTopic(p => ({ ...p, week_number: Number(e.target.value) }))}
                    className={styles.input} />
                </div>
              </div>
              <div className={styles.fieldWrap} style={{ marginBottom: 'var(--space-3)' }}>
                <label className={styles.fieldLabel}>Description (optional)</label>
                <textarea value={newTopic.description}
                  onChange={e => setNewTopic(p => ({ ...p, description: e.target.value }))}
                  placeholder="Brief notes on this topic..." rows={2}
                  className={styles.textarea} />
              </div>
              <div className={styles.formActions}>
                <button onClick={addTopic} disabled={saving || !newTopic.title}
                  className={styles.btnPrimary} style={{ background: sc }}>
                  {saving ? 'Adding...' : 'Add Topic'}
                </button>
                <button onClick={() => setShowAddTopic(false)} className={styles.btnSecondary}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Edit form */}
          {editTopicId && (
            <div className={styles.formCard}>
              <p className={styles.formTitle}>Edit Topic</p>
              <div className={styles.addTopicGrid}>
                <div className={styles.fieldWrap} style={{ flex: 1 }}>
                  <label className={styles.fieldLabel}>Topic Title *</label>
                  <input value={editTopic.title}
                    onChange={e => setEditTopic(p => ({ ...p, title: e.target.value }))}
                    className={styles.input} />
                </div>
                <div className={styles.fieldWrap} style={{ width: 80 }}>
                  <label className={styles.fieldLabel}>Week</label>
                  <input type="number" min={1} max={20}
                    value={editTopic.week_number}
                    onChange={e => setEditTopic(p => ({ ...p, week_number: Number(e.target.value) }))}
                    className={styles.input} />
                </div>
              </div>
              <div className={styles.fieldWrap} style={{ marginBottom: 'var(--space-3)' }}>
                <label className={styles.fieldLabel}>Description</label>
                <textarea value={editTopic.description}
                  onChange={e => setEditTopic(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                  className={styles.textarea} />
              </div>
              <div className={styles.formActions}>
                <button onClick={saveEditTopic} disabled={saving}
                  className={styles.btnPrimary} style={{ background: sc }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button onClick={() => setEditTopicId(null)} className={styles.btnSecondary}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Topics list */}
          {!selectedClass?.class_subject_id ? (
            <div className={styles.noSubjectMsg}>
              ⚠️ No subject assigned to this class yet. Ask the principal to set up class subjects.
            </div>
          ) : topics.length === 0 ? (
            <div className={styles.empty}>
              <BookOpenIcon size={38} color="var(--text-faint)" strokeWidth={1} />
              <p>No topics for {term} yet. Add your first topic above.</p>
            </div>
          ) : (
            <div className={styles.topicList}>
              {topics.map(topic => (
                <div key={topic.id}
                  className={styles.topicRow}
                  style={{
                    background: topic.is_covered ? '#10B98108' : 'var(--glass-bg)',
                    border: `1px solid ${topic.is_covered ? '#10B98130' : 'var(--glass-border)'}`,
                  }}>
                  {/* Covered toggle */}
                  <button onClick={() => toggleCovered(topic.id, topic.is_covered)}
                    className={styles.coverBtn}
                    style={{
                      border: `2px solid ${topic.is_covered ? '#10B981' : 'var(--glass-border)'}`,
                      background: topic.is_covered ? '#10B981' : 'transparent',
                    }}>
                    {topic.is_covered && <CheckCircleIcon size={12} color="white" />}
                  </button>

                  {/* Info */}
                  <div className={styles.topicInfo}>
                    <p className={styles.topicTitle}
                      style={{
                        color: topic.is_covered ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: topic.is_covered ? 'line-through' : 'none',
                      }}>
                      Wk {topic.week_number} · {topic.title}
                    </p>
                    {topic.description && (
                      <p className={styles.topicDesc}>{topic.description}</p>
                    )}
                  </div>

                  {topic.is_covered && topic.covered_at && (
                    <span className={styles.coveredDate}>
                      {new Date(topic.covered_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                    </span>
                  )}

                  {/* Edit button */}
                  <button
                    onClick={() => {
                      setEditTopicId(topic.id)
                      setEditTopic({ title: topic.title, description: topic.description ?? '', week_number: topic.week_number })
                      setShowAddTopic(false)
                    }}
                    className={styles.editTopicBtn}
                    style={{ color: sc }}
                    title="Edit topic">
                    ✏️
                  </button>

                  {/* Delete */}
                  <button onClick={() => deleteTopic(topic.id)} className={styles.deleteTopicBtn}>✕</button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── PDF TAB ─────────────────────────────────────────── */}
      {tab === 'pdf' && (
        <div className={styles.pdfTab}>
          <p className={styles.pdfDesc}>
            Upload the official {term} syllabus PDF for <strong>{selectedClass?.class_name}</strong>.
            Students can download it from their portal.
          </p>

          <input ref={pdfRef} type="file" accept=".pdf,.doc,.docx"
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadSyllabusPdf(f) }}
            style={{ display: 'none' }} />

          {syllabusPdf ? (
            <div className={styles.pdfCard}>
              <div className={styles.pdfIcon} style={{ background: sc + '20' }}>
                <BookOpenIcon size={20} color={sc} />
              </div>
              <div className={styles.pdfInfo}>
                <p className={styles.pdfName}>{term} Syllabus</p>
                <p className={styles.pdfMeta}>{selectedClass?.class_name} · {ACADEMIC_YEAR}</p>
              </div>
              <div className={styles.pdfActions}>
                <a href={syllabusPdf.file_url} target="_blank" rel="noreferrer"
                  className={styles.viewPdfBtn} style={{ background: sc + '20', color: sc, border: `1px solid ${sc}40` }}>
                  <DownloadIcon size={14} color={sc} /> View
                </a>
                <button onClick={() => pdfRef.current?.click()} disabled={uploadingPdf}
                  className={styles.replacePdfBtn}>
                  {uploadingPdf ? 'Uploading...' : 'Replace'}
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => pdfRef.current?.click()} disabled={uploadingPdf}
              className={styles.uploadDropzone}
              style={{ borderColor: sc + '50', background: sc + '08', color: sc }}>
              {uploadingPdf ? 'Uploading...' : `📄 Upload ${term} Syllabus PDF`}
            </button>
          )}
        </div>
      )}

      <div style={{ height: 100 }} />
    </RolePageWrapper>
  )
}
