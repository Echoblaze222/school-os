'use client'
// src/app/dashboard/vice-principal/announcements/AnnouncementsClient.tsx

import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import RoleSubHeader from '@/components/RoleSubHeader'
import { MapPinIcon, TrashIcon, CheckIcon } from '@/components/Icons'
import { VP_FEATURE_GROUPS } from '../featureGroups'
import type { DepartmentWithStats } from '@/lib/supabase/appointments'
import styles from './announcements.module.css'

interface Announcement {
  id: string; title: string; body: string; audience: string
  target_department_id: string | null; department_name: string | null
  is_pinned: boolean; priority: string; created_at: string; author_id: string
}

interface Props {
  profile: any; school: any; userId: string
  departments: DepartmentWithStats[]
  scopedDepartmentIds: string[]
}

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Something went wrong.')
  return json
}

function DraftLoader({ onLoaded }: { onLoaded: (title: string, body: string) => void }) {
  const searchParams = useSearchParams()
  const router = useRouter()
  useEffect(() => {
    const draftId = searchParams.get('draftId')
    if (!draftId) return
    ;(async () => {
      const supabase = createClient()
      const { data: draft, error } = await supabase
        .from('ai_action_drafts').select('id, title, payload').eq('id', draftId).eq('action_type', 'announcement').single()
      if (error || !draft) return
      onLoaded(draft.title ?? '', draft.payload?.body ?? '')
      await supabase.from('ai_action_drafts').delete().eq('id', draftId)
      router.replace('/dashboard/vice-principal/announcements')
    })()
  }, [searchParams])
  return null
}

export default function AnnouncementsClient({ profile, school, userId, departments, scopedDepartmentIds }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [draftBanner, setDraftBanner] = useState('')

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [targetDeptId, setTargetDeptId] = useState('')
  const [pinned, setPinned] = useState(false)
  const [posting, setPosting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  const scopedDepts = departments.filter(d => scopedDepartmentIds.includes(d.id))

  useEffect(() => {
    (async () => {
      try {
        const { announcements } = await api('/api/org/announcements')
        setAnnouncements(announcements)
      } catch (e: any) { setError(e.message) } finally { setLoading(false) }
    })()
  }, [])

  function handleDraftLoaded(t: string, b: string) {
    setTitle(t); setBody(b)
    setDraftBanner(`Loaded "${t}" from the AI Assistant. Review below, then post it yourself.`)
    titleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  async function handlePost() {
    if (!title.trim() || !body.trim()) return
    setPosting(true); setError('')
    try {
      const { announcement } = await api('/api/org/announcements', {
        method: 'POST',
        body: JSON.stringify({
          title, body,
          audience: targetDeptId ? 'staff' : 'staff',
          target_department_id: targetDeptId || null,
          is_pinned: pinned,
        }),
      })
      setAnnouncements(prev => [{ ...announcement, department_name: departments.find(d => d.id === targetDeptId)?.name ?? null }, ...prev])
      setTitle(''); setBody(''); setTargetDeptId(''); setPinned(false); setDraftBanner('')
    } catch (e: any) { setError(e.message) } finally { setPosting(false) }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this announcement?')) return
    try { await api(`/api/org/announcements/${id}`, { method: 'DELETE' }); setAnnouncements(prev => prev.filter(a => a.id !== id)) }
    catch (e: any) { setError(e.message) }
  }

  return (
    <RoleSubHeader userId={userId} role="vice-principal" profile={profile} school={school} title="Announcements" featureGroups={VP_FEATURE_GROUPS}>
      <Suspense fallback={null}>
        <DraftLoader onLoaded={handleDraftLoaded} />
      </Suspense>

      {draftBanner && <div className={styles.draftBanner}><CheckIcon size={13} /> {draftBanner}</div>}
      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={`glass-card ${styles.composer}`}>
        <input ref={titleRef} className={styles.input} placeholder="Announcement title" value={title} onChange={e => setTitle(e.target.value)} />
        <textarea className={styles.textarea} placeholder="Write the announcement…" value={body} onChange={e => setBody(e.target.value)} rows={4} />
        <div className={styles.composerRow}>
          <select className={styles.select} value={targetDeptId} onChange={e => setTargetDeptId(e.target.value)}>
            <option value="">All staff</option>
            {scopedDepts.map(d => <option key={d.id} value={d.id}>{d.name} department</option>)}
          </select>
          <label className={styles.pinCheck}>
            <input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)} /> Pin
          </label>
          <button className={styles.postBtn} onClick={handlePost} disabled={posting || !title.trim() || !body.trim()}>
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
        {scopedDepts.length === 0 && departments.length > 0 && (
          <p className={styles.hint}>You can only target departments assigned to your scope. Ask your Principal to configure this if you need to post to a specific one.</p>
        )}
      </div>

      <p className={styles.sectionLabel}>Recent</p>
      {loading ? (
        <p className={styles.hint}>Loading…</p>
      ) : announcements.length === 0 ? (
        <div className={styles.emptyState}><p>No announcements yet.</p></div>
      ) : (
        <div className={styles.list}>
          {announcements.map(a => (
            <div key={a.id} className={`glass-card ${styles.row}`}>
              <div className={styles.rowHeader}>
                <p className={styles.rowTitle}>{a.is_pinned && <MapPinIcon size={11} />} {a.title}</p>
                {a.author_id === userId && (
                  <button className={styles.deleteBtn} onClick={() => handleDelete(a.id)}><TrashIcon size={13} /></button>
                )}
              </div>
              <p className={styles.rowBody}>{a.body}</p>
              <p className={styles.rowMeta}>
                {a.department_name ? `${a.department_name} department` : 'All staff'} · {new Date(a.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </div>
      )}
      <div style={{ height: 40 }} />
    </RoleSubHeader>
  )
}
