// src/app/(public)/blog/[slug]/page.tsx
// Phase 4, Lane H (§54 - SEO metadata). Server component so
// generateMetadata can populate real <title>/<meta description> tags
// from seo_title/seo_description before the page ever reaches the
// client - a client-fetched page can't do that.

import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReportContentButton from '@/components/ReportContentButton'
import { CalendarIcon } from '@/components/Icons'

async function getPost(slug: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('content_posts')
    .select('id, title, slug, author_name, category, cover_image_url, body, tags, seo_title, seo_description, publish_at')
    .eq('slug', slug)
    .maybeSingle()
  return data
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) return { title: 'Not Found | SchoolOS' }
  return {
    title: `${post.seo_title || post.title} | SchoolOS`,
    description: post.seo_description || undefined,
  }
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await getPost(slug)
  if (!post) notFound()

  return (
    <article>
      {post.cover_image_url && (
        <img src={post.cover_image_url} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 20, display: 'block' }} />
      )}
      <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 8px', lineHeight: 1.3 }}>
        {post.title}
      </h1>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, margin: 0 }}>
          <CalendarIcon size={11} />
          {post.publish_at ? new Date(post.publish_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : ''} - {post.author_name}
        </p>
        <ReportContentButton targetType="content_post" targetId={post.id} />
      </div>

      <div style={{ fontSize: '0.92rem', color: 'var(--text-secondary)', lineHeight: 1.75 }}>
        {post.body.split('\n\n').map((para: string, i: number) => (
          <p key={i} style={{ margin: '0 0 16px' }}>{para}</p>
        ))}
      </div>

      {post.tags?.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 24 }}>
          {post.tags.map((t: string) => (
            <span key={t} style={{ fontSize: '0.72rem', padding: '3px 10px', background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 999, color: 'var(--text-muted)' }}>
              #{t}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}
