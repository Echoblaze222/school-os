// src/app/robots.ts
// Generates /robots.txt. The public marketing / discovery surface (home,
// discover, find-schools, rankings, school profiles, blog, register-school)
// is crawlable. Everything that needs a session, or is internal plumbing,
// is disallowed so it stays out of crawl budget and search results (a login
// page or a stale dashboard URL showing up in Google is exactly the "why is
// this indexed?" bug this avoids). RLS already keeps private data away from
// an anonymous crawler; this is about not wasting crawls and not listing
// pages that are useless to a searcher.
import type { MetadataRoute } from 'next'
import { SITE_URL } from '@/lib/seo'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/'],
        disallow: [
          '/dashboard',
          '/admin',
          '/super-admin',
          '/api/',
          '/onboarding',
          '/login',
          '/select-school',
          '/forgot-password',
          '/reset-password',
          '/verify',
          '/splash',
          '/offline',
          '/school-locked',
          '/join',
          '/register-school/pending',
          '/register-school/success',
          '/register-school/failed',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  }
}
