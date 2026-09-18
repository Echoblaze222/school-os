// src/app/robots.ts
// Generates /robots.txt. Allows the public marketing/discovery surface
// (home, discover, find-schools, rankings, school profiles, blog,
// register-school) and disallows everything that requires a session or
// is internal plumbing — none of that should be crawled or indexed, and
// RLS already keeps it inaccessible to an unauthenticated crawler anyway,
// but an explicit disallow keeps it out of crawl budget and search
// results (e.g. a login page or a stale dashboard URL showing up in
// Google is exactly the "wait, why is this indexed?" bug this avoids).
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
          '/dashboard/',
          '/admin',
          '/admin/',
          '/super-admin',
          '/super-admin/',
          '/api/',
          '/onboarding',
          '/onboarding/',
          '/login',
          '/select-school',
          '/forgot-password',
          '/reset-password',
          '/verify',
          '/splash',
          '/school-locked',
          '/join',
          '/register-school/pending',
          '/register-school/success',
          '/register-school/failed',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
