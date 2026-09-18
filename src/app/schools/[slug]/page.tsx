// src/app/schools/[slug]/page.tsx
// Public school profile (Lane B, S45).

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicSchoolBySlug, getPublicSchoolEvents } from '@/lib/publicSchools'
import PublicNav from '@/components/public/PublicNav'
import PublicFooter from '@/components/public/PublicFooter'
import ProfileClient from './ProfileClient'
import { pageMetadata, schoolJsonLd, DEFAULT_OG_IMAGE } from '@/lib/seo'

export const revalidate = 120

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const school = await getPublicSchoolBySlug(createAdminClient(), slug)
  if (!school) return { title: 'School not found', robots: { index: false, follow: false } }

  const description =
    school.tagline || school.description?.slice(0, 155) || `${school.name} on SchoolOS.`

  return pageMetadata({
    title: `${school.name}${school.city ? ` — ${school.city}` : ''}`,
    description,
    path: `/schools/${school.slug}`,
    image: school.cover_image_url || school.logo_url || DEFAULT_OG_IMAGE,
    type: 'website',
  })
}

export default async function SchoolProfilePage({ params }: PageProps) {
  const { slug } = await params
  const admin = createAdminClient()
  const school = await getPublicSchoolBySlug(admin, slug)

  if (!school) notFound()

  const events = await getPublicSchoolEvents(admin, school.id)
  const jsonLd = schoolJsonLd(school)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicNav />
      <main style={{ flex: 1 }}>
        <ProfileClient school={school} events={events} />
      </main>
      <PublicFooter />
    </div>
  )
}
