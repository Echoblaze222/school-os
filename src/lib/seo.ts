// src/lib/seo.ts
// Shared SEO defaults + helpers. Every public page pulls the same site URL,
// name and social image from here instead of hard-coding them.
//
// SERVER ONLY: this reads server environment variables (and is used by
// metadata exports, robots.ts and sitemap.ts). Do not import it from a
// 'use client' component.
//
// SITE_URL resolution order:
//   1. NEXT_PUBLIC_SITE_URL   - set this once SchoolOS has its own domain
//   2. VERCEL_PROJECT_PRODUCTION_URL - Vercel's own production domain
//   3. the current production deployment domain below
// so canonical links, the sitemap and social cards always point at a real,
// working address instead of a domain nobody owns yet.
import type { Metadata } from 'next'

const FALLBACK_SITE_URL = 'https://school-os-sphg.vercel.app'

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  let raw = explicit || vercelProd || FALLBACK_SITE_URL
  if (!/^https?:\/\//i.test(raw)) raw = `https://${raw}`
  return raw.replace(/\/+$/, '')
}

export const SITE_URL = resolveSiteUrl()
export const SITE_NAME = 'SchoolOS'
export const DEFAULT_TITLE = "SchoolOS | Nigeria's Smartest School Portal"
export const DEFAULT_DESCRIPTION =
  "SchoolOS is Nigeria's all-in-one school management platform: admissions, fees, results, attendance and an AI assistant for every role, built for Nigerian schools."
export const DEFAULT_OG_IMAGE = '/branding/schoolos-lockup.png'

interface PageMetadataInput {
  /** Full title, e.g. 'Find Schools in Nigeria | SchoolOS' (no title template is applied). */
  title: string
  description: string
  /** Path of the page, e.g. '/discover'. Used for the canonical link and og:url. */
  path: string
  image?: string
  noIndex?: boolean
  type?: 'website' | 'article'
}

/** Page-level Metadata with canonical + OpenGraph + Twitter filled in from the
 *  shared defaults, so a page only supplies its title, description and path. */
export function pageMetadata({
  title,
  description,
  path,
  image = DEFAULT_OG_IMAGE,
  noIndex = false,
  type = 'website',
}: PageMetadataInput): Metadata {
  const url = `${SITE_URL}${path}`

  return {
    title,
    description,
    alternates: { canonical: url },
    robots: noIndex ? { index: false, follow: false } : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: image, alt: title }],
      locale: 'en_NG',
      type,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

/** Serialise JSON-LD for a <script type="application/ld+json"> tag. Schools and
 *  blog posts contain user-written text, so '<' is escaped to stop a value such
 *  as "</script><script>..." from breaking out of the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}

/** schema.org EducationalOrganization for a school's public profile page. */
export function schoolJsonLd(school: {
  name: string
  slug: string
  description?: string | null
  tagline?: string | null
  logo_url?: string | null
  cover_image_url?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  public_phone?: string | null
  public_email?: string | null
  website_url?: string | null
  founded_year?: number | null
  social_links?: Record<string, string> | null
}) {
  const sameAs = [school.website_url, ...Object.values(school.social_links ?? {})]
    .filter((u): u is string => typeof u === 'string' && /^https?:\/\//i.test(u))

  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: school.name,
    description: school.description || school.tagline || undefined,
    url: `${SITE_URL}/schools/${school.slug}`,
    logo: school.logo_url || undefined,
    image: school.cover_image_url || school.logo_url || undefined,
    telephone: school.public_phone || undefined,
    email: school.public_email || undefined,
    foundingDate: school.founded_year ? String(school.founded_year) : undefined,
    sameAs: sameAs.length > 0 ? sameAs : undefined,
    address: {
      '@type': 'PostalAddress',
      addressLocality: school.city || undefined,
      addressRegion: school.state || undefined,
      addressCountry: school.country || 'NG',
    },
  }
}

/** schema.org BlogPosting for a published blog post. */
export function blogPostJsonLd(post: {
  title: string
  slug: string
  author_name: string
  cover_image_url?: string | null
  publish_at?: string | null
  seo_description?: string | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    author: { '@type': 'Person', name: post.author_name },
    image: post.cover_image_url || undefined,
    datePublished: post.publish_at || undefined,
    description: post.seo_description || undefined,
    mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}${DEFAULT_OG_IMAGE}` },
    },
  }
}
