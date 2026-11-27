// src/app/sitemap.ts
// /sitemap.xml: the static public routes + every publicly listed, active
// school + every published blog post.
//
// Uses the admin client for the same reason the public directory does (see
// lib/publicSchools.ts): these are exactly the rows a school opted to make
// public, filtered the way a visitor would see them, just enumerated.
//
// If the database is unreachable the sitemap still answers with the static
// routes instead of failing with a 500 (a failing sitemap makes crawlers
// back off), and it is regenerated hourly so the dynamic entries catch up.
import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { SITE_URL } from '@/lib/seo'

export const revalidate = 3600

type ChangeFreq = NonNullable<MetadataRoute.Sitemap[number]['changeFrequency']>

const STATIC_ROUTES: { path: string; priority: number; changeFrequency: ChangeFreq }[] = [
  { path: '/',                priority: 1.0, changeFrequency: 'weekly'  },
  { path: '/find-schools',    priority: 0.9, changeFrequency: 'daily'   },
  { path: '/discover',        priority: 0.8, changeFrequency: 'daily'   },
  { path: '/rankings',        priority: 0.8, changeFrequency: 'weekly'  },
  { path: '/find-school',     priority: 0.7, changeFrequency: 'weekly'  },
  { path: '/blog',            priority: 0.7, changeFrequency: 'daily'   },
  { path: '/register-school', priority: 0.6, changeFrequency: 'monthly' },
  { path: '/terms',           priority: 0.2, changeFrequency: 'yearly'  },
  { path: '/privacy',         priority: 0.2, changeFrequency: 'yearly'  },
]

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))

  try {
    const admin = createAdminClient()

    const { data: schools, error: schoolsError } = await admin
      .from('schools')
      .select('slug')
      .eq('is_publicly_listed', true)
      .eq('is_platform_active', true)
      .limit(5000)
    if (schoolsError) throw schoolsError

    for (const s of schools ?? []) {
      if (!s.slug) continue
      entries.push({
        url: `${SITE_URL}/schools/${s.slug}`,
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }

    const { data: posts, error: postsError } = await admin
      .from('content_posts')
      .select('slug, publish_at')
      .eq('status', 'published')
      .limit(5000)
    if (postsError) throw postsError

    for (const p of posts ?? []) {
      if (!p.slug) continue
      entries.push({
        url: `${SITE_URL}/blog/${p.slug}`,
        lastModified: p.publish_at ? new Date(p.publish_at) : undefined,
        changeFrequency: 'monthly',
        priority: 0.5,
      })
    }
  } catch (err) {
    console.error('[sitemap] could not load dynamic entries, serving static routes only:', err)
  }

  return entries
}
