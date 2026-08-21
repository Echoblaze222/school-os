'use client'
// src/app/(public)/blog/BlogListClient.tsx
// Phase 4, Lane H (§54).

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { BookOpenIcon, CalendarIcon } from '@/components/Icons'

interface Post {
  id: string
  title: string
  slug: string
  author_name: string
  category: string
  cover_image_url: string | null
  excerpt: string | null
  tags: string[]
  publish_at: string | null
}

const CATEGORY_LABEL: Record<string, string> = {
  education_article: 'Education', product_update: 'Product Update',
  platform_announcement: 'Announcement', guide: 'Guide',
  success_story: 'Success Story', education_news: 'News',
  tutorial: 'Tutorial', feature_announcement: 'New Feature',
}

export default function BlogListClient() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/public/content')
      .then(res => res.json())
      .then(json => setPosts(json.posts ?? []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px' }}>
        SchoolOS Blog
      </h1>
      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: '0 0 24px' }}>
        Education articles, product updates, and guides.
      </p>

      {loading ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading...</p>
      ) : posts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0' }}>
          <BookOpenIcon size={36} color="var(--text-faint)" />
          <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginTop: 8 }}>No posts published yet.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {posts.map(p => (
            <Link key={p.id} href={`/blog/${p.slug}`}
              style={{ display: 'block', padding: 16, background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 14, textDecoration: 'none' }}>
              <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--brand)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {CATEGORY_LABEL[p.category] ?? p.category}
              </span>
              <h2 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)', margin: '4px 0 6px' }}>{p.title}</h2>
              {p.excerpt && <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5, margin: '0 0 8px' }}>{p.excerpt}</p>}
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
                <CalendarIcon size={11} /> {p.publish_at ? new Date(p.publish_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} - {p.author_name}
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
