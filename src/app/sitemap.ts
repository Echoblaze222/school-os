// src/app/sitemap.ts
// Static public routes + every publicly-listed, active school + every
// published blog post. Uses the admin client for the same reason the
// public directory pages do (see lib/publicSchools.ts) — these are
// exactly the rows a school opted to make public, filtered the same way
// a visitor would see them, just enumerated instead of paginated.
import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { SITE_URL } from '@/lib/seo'

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: ChangeFreq }[] = [
  { path: '/',              priority: 1.0, changeFrequency: 'daily' },
  { path: '/find-schools',  priority: 0.9, changeFrequency: 'daily' },
  { path: '/discover',      priority: 0.8, changeFrequency: 'daily' },
  { path: '/rankings',      priority: 0.8, changeFrequency: 'weekly' },
  { path: '/find-school',   priority: 0.7, changeFrequency: 'weekly' },
  { path: '/blog',          priority: 0.7, changeFrequency: 'daily' },
  { path: '/register-school', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/terms',         priority: 0.2, changeFrequency: 'yearly' },
  { path: '/privacy',       priority: 0.2, changeFrequency: 'yearly' },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const admin = createAdminClient()

  const staticEntries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: new Date(),
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  const { data: schools } = await admin
    .from('schools')
    .select('slug')
    .eq('is_publicly_listed', true)
    .eq('is_platform_active', true)

  const schoolEntries: MetadataRoute.Sitemap = (schools ?? []).map((s) => ({
    url: `${SITE_URL}/schools/${s.slug}`,
    lastModified: new Date(),
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  const { data: posts } = await admin
    .from('content_posts')
    .select('slug, publish_at')
    .eq('status', 'published')

  const postEntries: MetadataRoute.Sitemap = (posts ?? []).map((p) => ({
    url: `${SITE_URL}/blog/${p.slug}`,
    lastModified: p.publish_at ? new Date(p.publish_at) : new Date(),
    changeFrequency: 'monthly',
    priority: 0.5,
  }))

  return [...staticEntries, ...schoolEntries, ...postEntries]
}
