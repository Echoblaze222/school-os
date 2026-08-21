// src/app/(public)/blog/page.tsx
// Phase 4, Lane H (§54). Reuses the (public) route group's shell
// (layout.tsx) that Lane C established, rather than building a second
// public header.

import BlogListClient from './BlogListClient'

export const metadata = {
  title: 'Blog | SchoolOS',
  description: 'Education articles, product updates, guides, and news from SchoolOS.',
}

export default function BlogPage() {
  return <BlogListClient />
}
