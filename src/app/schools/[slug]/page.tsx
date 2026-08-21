// src/app/schools/[slug]/page.tsx
// Public school profile (Lane B, S45).

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { getPublicSchoolBySlug, getPublicSchoolEvents } from '@/lib/publicSchools'
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
  if (!school) return { title: 'School not found | SchoolOS' }

  return {
    title: `${school.name} | SchoolOS`,
    description: school.tagline || school.description?.slice(0, 155) || `${school.name} on SchoolOS.`,
  }
}

export default async function SchoolProfilePage({ params }: PageProps) {
  const { slug } = await params
  const admin = createAdminClient()
  const school = await getPublicSchoolBySlug(admin, slug)

  if (!school) notFound()

  const events = await getPublicSchoolEvents(admin, school.id)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNav />
      <main style={{ flex: 1 }}>
        <ProfileClient school={school} events={events} />
      </main>
      <PublicFooter />
    </div>
  )
}
