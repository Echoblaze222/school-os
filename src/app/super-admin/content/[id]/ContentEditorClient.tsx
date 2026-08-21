'use client'
// src/app/super-admin/content/[id]/ContentEditorClient.tsx
// Phase 4, Lane H (§54, §55).

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeftIcon, TrashIcon } from '@/components/Icons'

const CATEGORIES = [
  { value: 'education_article',     label: 'Education Article' },
  { value: 'product_update',        label: 'Product Update' },
  { value: 'platform_announcement', label: 'Platform Announcement' },
  { value: 'guide',                 label: 'Guide' },
  { value: 'success_story',         label: 'School Success Story' },
  { value: 'education_news',        label: 'Education News' },
  { value: 'tutorial',              label: 'Tutorial' },
  { value: 'feature_announcement',  label: 'Feature Announcement' },
]
const STATUSES = ['draft', 'review', 'scheduled', 'published', 'archived']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', background: 'var(--input-bg)',
  border: '1px solid var(--input-border)', borderRadius: 8,
  color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6,
}

export default function ContentEditorClient({ postId }: { postId: string }) {
  const isNew = postId === 'new'
  const router = useRouter()

  const [loading, setLoading] = useState(!isNew)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')
  const [isError, setIsError] = useState(false)

  const [title, setTitle] = useState('')
  const [category, setCategory] = useState('education_article')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [body, setBody] = useState('')
  const [tags, setTags] = useState('')
  const [seoTitle, setSeoTitle] = useState('')
  const [seoDescription, setSeoDescription] = useState('')
  const [status, setStatus] = useState('draft')
  const [publishAt, setPublishAt] = useState('')
  const [slug, setSlug] = useState('')

  useEffect(() => {
    if (isNew) return
    fetch(`/api/super-admin/content/${postId}`)
      .then(res => res.json())
      .then(json => {
        if (!json.ok) { setIsError(true); setMsg(json.error); return }
        const p = json.post
        setTitle(p.title); setCategory(p.category); setCoverImageUrl(p.cover_image_url ?? '')
        setExcerpt(p.excerpt ?? ''); setBody(p.body); setTags((p.tags ?? []).join(', '))
        setSeoTitle(p.seo_title ?? ''); setSeoDescription(p.seo_description ?? '')
        setStatus(p.status); setSlug(p.slug)
        setPublishAt(p.publish_at ? p.publish_at.slice(0, 16) : '')
      })
      .finally(() => setLoading(false))
  }, [postId, isNew])

  async function save(nextStatus?: string) {
    setSaving(true); setMsg(''); setIsError(false)
    const payload: Record<string, unknown> = {
      title, category, cover_image_url: coverImageUrl || undefined,
      excerpt: excerpt || undefined, body,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      seo_title: seoTitle || undefined, seo_description: seoDescription || undefined,
    }
    if (publishAt) payload.publish_at = new Date(publishAt).toISOString()
    if (nextStatus) payload.status = nextStatus

    if (isNew) {
      const res = await fetch('/api/super-admin/content', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const json = await res.json()
      setSaving(false)
      if (json.ok) {
        router.replace(`/super-admin/content/${json.post.id}`)
      } else {
        setIsError(true); setMsg(json.error || "Couldn't create post.")
      }
      return
    }

    const res = await fetch(`/api/super-admin/content/${postId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    })
    const json = await res.json()
    setSaving(false)
    if (json.ok) {
      setStatus(json.post.status)
      setMsg('Saved.')
    } else {
      setIsError(true); setMsg(json.error || "Couldn't save.")
    }
  }

  async function archive() {
    if (isNew) return
    if (!confirm('Archive this post? It will no longer be publicly visible.')) return
    const res = await fetch(`/api/super-admin/content/${postId}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.ok) router.push('/super-admin/content')
  }

  if (loading) return <div style={{ padding: 'var(--space-5)', color: 'var(--text-muted)' }}>Loading...</div>

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 'var(--space-5)' }}>
      <Link href="/super-admin/content" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none', marginBottom: 'var(--space-4)' }}>
        <ArrowLeftIcon size={14} /> Back to Content
      </Link>

      <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>
        {isNew ? 'New Post' : 'Edit Post'}
      </h1>
      {slug && <p style={{ fontSize: '0.75rem', color: 'var(--text-faint)', fontFamily: 'monospace', margin: '0 0 var(--space-4)' }}>/blog/{slug}</p>}
      {!slug && <div style={{ marginBottom: 'var(--space-4)' }} />}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>Title</label>
          <input value={title} onChange={e => setTitle(e.target.value)} style={inputStyle} placeholder="Post title" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} style={inputStyle}>
              {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Publish Date</label>
            <input type="datetime-local" value={publishAt} onChange={e => setPublishAt(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>Cover Image URL</label>
          <input value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} style={inputStyle} placeholder="https://..." />
        </div>

        <div>
          <label style={labelStyle}>Excerpt</label>
          <textarea value={excerpt} onChange={e => setExcerpt(e.target.value)} style={{ ...inputStyle, height: 60, resize: 'vertical' }} placeholder="Short summary shown in listings" />
        </div>

        <div>
          <label style={labelStyle}>Body</label>
          <textarea value={body} onChange={e => setBody(e.target.value)} style={{ ...inputStyle, height: 280, resize: 'vertical', lineHeight: 1.6 }} placeholder="Write the post... (blank line = new paragraph)" />
        </div>

        <div>
          <label style={labelStyle}>Tags (comma-separated)</label>
          <input value={tags} onChange={e => setTags(e.target.value)} style={inputStyle} placeholder="admissions, tips, boarding-school" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>SEO Title</label>
            <input value={seoTitle} onChange={e => setSeoTitle(e.target.value)} style={inputStyle} maxLength={70} />
          </div>
          <div>
            <label style={labelStyle}>SEO Description</label>
            <input value={seoDescription} onChange={e => setSeoDescription(e.target.value)} style={inputStyle} maxLength={200} />
          </div>
        </div>

        {!isNew && (
          <div>
            <label style={labelStyle}>Status</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {STATUSES.map(s => (
                <button key={s} onClick={() => save(s)} disabled={saving}
                  style={{
                    padding: '6px 14px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                    background: status === s ? 'var(--brand)' : 'var(--glass-bg)',
                    color: status === s ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${status === s ? 'var(--brand)' : 'var(--glass-border)'}`,
                  }}>
                  {s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        )}

        {msg && <p style={{ color: isError ? 'var(--danger)' : '#10B981', fontSize: '0.8rem', margin: 0 }}>{msg}</p>}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button onClick={() => save()} disabled={saving || !title || !body}
            style={{ flex: 1, height: 42, background: 'var(--brand)', color: '#fff', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : isNew ? 'Create Draft' : 'Save Changes'}
          </button>
          {!isNew && (
            <button onClick={archive}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px', background: 'var(--danger-subtle)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: 'var(--danger)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
              <TrashIcon size={14} /> Archive
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
