// src/app/schools/[slug]/page.tsx
// Public school profile (Lane B, S45).

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicSchoolBySlug, getPublicSchoolEvents } from '@/lib/publicSchools'
import { pageMetadata, schoolJsonLd, jsonLdString, DEFAULT_OG_IMAGE } from '@/lib/seo'
import PublicNav from '@/components/public/PublicNav'
import PublicFooter from '@/components/public/PublicFooter'
import ProfileClient from './ProfileClient'

export const revalidate = 120

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const school = await getPublicSchoolBySlug(createAdminClient(), slug)
  if (!school) {
    return { title: 'School not found | SchoolOS', robots: { index: false, follow: false } }
  }

  return pageMetadata({
    title: `${school.name}${school.city ? ` - ${school.city}` : ''} | SchoolOS`,
    description: school.tagline || school.description?.slice(0, 155) || `${school.name} on SchoolOS.`,
    path: `/schools/${school.slug}`,
    image: school.cover_image_url || school.logo_url || DEFAULT_OG_IMAGE,
  })
}

export default async function SchoolProfilePage({ params }: PageProps) {
  const { slug } = await params
  const admin = createAdminClient()
  const school = await getPublicSchoolBySlug(admin, slug)

  if (!school) notFound()

  const events = await getPublicSchoolEvents(admin, school.id)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(schoolJsonLd(school)) }}
      />
      <PublicNav />
      <main style={{ flex: 1 }}>
        <ProfileClient school={school} events={events} />
      </main>
      <PublicFooter />
    </div>
  )
}
