'use client'
// src/app/super-admin/content/ContentClient.tsx
// Phase 4, Lane H (§55) content management list view.

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ArrowLeftIcon, PlusIcon, BookOpenIcon, EditIcon } from '@/components/Icons'

interface PostSummary {
  id: string
  title: string
  slug: string
  category: string
  status: string
  author_name: string
  publish_at: string | null
  updated_at: string
}

const STATUS_COLOR: Record<string, string> = {
  draft: 'var(--text-muted)', review: '#F59E0B', scheduled: '#3B82F6',
  published: '#10B981', archived: 'var(--text-faint)',
}
const CATEGORY_LABEL: Record<string, string> = {
  education_article: 'Education', product_update: 'Product Update',
  platform_announcement: 'Announcement', guide: 'Guide',
  success_story: 'Success Story', education_news: 'News',
  tutorial: 'Tutorial', feature_announcement: 'New Feature',
}

export default function ContentClient() {
  const [posts, setPosts] = useState<PostSummary[]>([])
  const [filter, setFilter] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const q = filter ? `?status=${filter}` : ''
    const res = await fetch(`/api/super-admin/content${q}`)
    const json = await res.json()
    setPosts(json.ok ? json.posts : [])
    setLoading(false)
  }, [filter])

  useEffect(() => { load() }, [load])

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 'var(--space-5)' }}>
      <Link href="/super-admin" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--text-muted)', fontSize: '0.85rem', textDecoration: 'none', marginBottom: 'var(--space-4)' }}>
        <ArrowLeftIcon size={14} /> Back
      </Link>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-4)', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 4px' }}>Content</h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>Official SchoolOS editorial content (§54, §55).</p>
        </div>
        <Link href="/super-admin/content/new"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'var(--brand)', color: '#fff', borderRadius: 10, fontWeight: 700, fontSize: '0.82rem', textDecoration: 'none' }}>
          <PlusIcon size={14} /> New Post
        </Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        {['', 'draft', 'review', 'scheduled', 'published', 'archived'].map(s => (
          <button key={s || 'all'} onClick={() => setFilter(s)}
            style={{
              padding: '6px 14px', borderRadius: 999, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
              background: filter === s ? 'var(--brand)' : 'var(--glass-bg)',
              color: filter === s ? '#fff' : 'var(--text-muted)',
              border: `1px solid ${filter === s ? 'var(--brand)' : 'var(--glass-border)'}`,
            }}>
            {s ? s[0].toUpperCase() + s.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</p>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 'var(--space-6) 0' }}>
          <BookOpenIcon size={36} color="var(--text-faint)" />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>No posts yet.</p>
        </div>
      ) : (
        <div style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 14, overflow: 'hidden' }}>
          {posts.map(p => (
            <Link key={p.id} href={`/super-admin/content/${p.id}`}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--glass-border)', textDecoration: 'none' }}>
              <div>
                <p style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 4px' }}>{p.title}</p>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>
                  {CATEGORY_LABEL[p.category] ?? p.category} · {p.author_name} · Updated {new Date(p.updated_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                </p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: STATUS_COLOR[p.status], textTransform: 'uppercase' }}>{p.status}</span>
                <EditIcon size={14} color="var(--text-faint)" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
