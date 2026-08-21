// src/app/find-schools/page.tsx
// Public school discovery (Lane B, S39). Server-rendered first page for
// fast paint and basic SEO; DiscoveryClient takes over for interactive
// filtering without a full navigation on every change.

import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchPublicSchools } from '@/lib/publicSchools'
import PublicNav from '@/components/public/PublicNav'
import PublicFooter from '@/components/public/PublicFooter'
import DiscoveryClient from './DiscoveryClient'

export const metadata: Metadata = {
  title: 'Find Schools | SchoolOS',
  description: 'Search schools on SchoolOS by location, type, and education level.',
}

export const revalidate = 60

export default async function FindSchoolsPage() {
  let initialSchools: Awaited<ReturnType<typeof searchPublicSchools>>['schools'] = []
  let initialTotal = 0
  let loadFailed = false

  try {
    const result = await searchPublicSchools(createAdminClient(), { limit: 12 })
    initialSchools = result.schools
    initialTotal = result.total
  } catch (err) {
    console.error('[find-schools] initial load failed:', err)
    loadFailed = true
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNav />
      <main style={{ flex: 1 }}>
        <DiscoveryClient
          initialSchools={initialSchools}
          initialTotal={initialTotal}
          initialLoadFailed={loadFailed}
        />
      </main>
      <PublicFooter />
    </div>
  )
}
