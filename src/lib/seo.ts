// src/lib/seo.ts
// Shared SEO defaults + helpers. Centralizing this here means every page
// pulls the same site URL, name, and social image instead of hardcoding
// them (and drifting) across a dozen metadata exports.
//
// SITE_URL is a placeholder until SchoolOS has a production domain —
// once you have one, either set NEXT_PUBLIC_SITE_URL in your env, or
// just swap the fallback string below. Everything else (sitemap, robots,
// canonical URLs, OG urls) reads from this one constant.
import type { Metadata } from 'next'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://schoolos.ng'
export const SITE_NAME = 'SchoolOS'
export const DEFAULT_TITLE = "SchoolOS | Nigeria's Smartest School Portal"
export const DEFAULT_DESCRIPTION =
  "SchoolOS is Nigeria's all-in-one school management platform — admissions, fees, results, attendance, and an AI assistant for every role, built for Nigerian schools."
export const DEFAULT_OG_IMAGE = '/branding/schoolos-lockup.png'
export const TWITTER_HANDLE = '@schoolos_ng' // placeholder — update once a handle exists

interface PageMetadataInput {
  title: string
  description: string
  /** e.g. '/discover' — used to build the canonical + OG url */
  path: string
  image?: string
  noIndex?: boolean
  type?: 'website' | 'article'
}

/** Build a page-level Metadata object with OpenGraph + Twitter filled in
 *  from shared defaults, so individual pages only supply title,
 *  description, and their own path. */
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
    robots: noIndex
      ? { index: false, follow: false }
      : { index: true, follow: true },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [{ url: image, width: 1200, height: 630, alt: title }],
      locale: 'en_NG',
      type,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
      site: TWITTER_HANDLE,
    },
  }
}

/** JSON-LD for a school's public profile page (schema.org EducationalOrganization). */
export function schoolJsonLd(school: {
  name: string
  slug: string
  description?: string | null
  tagline?: string | null
  logo_url?: string | null
  city?: string | null
  state?: string | null
  country?: string | null
  public_phone?: string | null
  public_email?: string | null
  website_url?: string | null
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: school.name,
    description: school.description || school.tagline || undefined,
    url: `${SITE_URL}/schools/${school.slug}`,
    logo: school.logo_url || undefined,
    telephone: school.public_phone || undefined,
    email: school.public_email || undefined,
    sameAs: school.website_url ? [school.website_url] : undefined,
    address: {
      '@type': 'PostalAddress',
      addressLocality: school.city || undefined,
      addressRegion: school.state || undefined,
      addressCountry: school.country || 'NG',
    },
  }
}

/** JSON-LD for a blog post (schema.org BlogPosting). */
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
