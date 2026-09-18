// src/app/(public)/blog/page.tsx
// Phase 4, Lane H (§54). Reuses the (public) route group's shell
// (layout.tsx) that Lane C established, rather than building a second
// public header.

import type { Metadata } from 'next'
import BlogListClient from './BlogListClient'
import { pageMetadata } from '@/lib/seo'

export const metadata: Metadata = pageMetadata({
  title: 'Blog',
  description: 'Education articles, product updates, guides, and news from SchoolOS.',
  path: '/blog',
})

export default function BlogPage() {
  return <BlogListClient />
}
