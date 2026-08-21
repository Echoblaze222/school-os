// src/components/public/landing/FeaturedSchools.tsx
// Server component: queries directly (same-process, no fetch round trip)
// through the same safe-column helper the API routes use. Renders an
// honest invitation instead of a hollow section if no school has opted
// into public listing yet, rather than pretending the platform already
// has a directory full of schools.

import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { searchPublicSchools } from '@/lib/publicSchools'
import SchoolCard from '@/components/public/SchoolCard'
import { ArrowRightIcon, SchoolIcon } from '@/components/Icons'
import styles from './FeaturedSchools.module.css'

export default async function FeaturedSchools() {
  let schools: Awaited<ReturnType<typeof searchPublicSchools>>['schools'] = []
  let total = 0

  try {
    const result = await searchPublicSchools(createAdminClient(), { limit: 4, verifiedOnly: false })
    schools = result.schools
    total = result.total
  } catch (err) {
    console.error('[FeaturedSchools] failed to load:', err)
    // Fails soft: the landing page should never break because the
    // "featured schools" teaser couldn't load.
    return null
  }

  if (schools.length === 0) {
    return (
      <section className="page-content">
        <div className={`${styles.emptyCard} glass-card`}>
          <div className={styles.emptyIcon}><SchoolIcon size={22} /></div>
          <h3 className="h3">Be the first school on SchoolOS</h3>
          <p className="body" style={{ maxWidth: 480, margin: '0 auto' }}>
            Public school profiles are opt-in. Register your school and turn on your
            public profile from Settings to appear here.
          </p>
          <Link href="/register-school" className="btn btn-primary" style={{ marginTop: 'var(--space-2)' }}>
            Register your school <ArrowRightIcon size={14} />
          </Link>
        </div>
      </section>
    )
  }

  return (
    <section className="page-content">
      <div className={styles.headingRow}>
        <div>
          <span className="overline">On SchoolOS</span>
          <h2 className="h2">Schools already on the platform</h2>
        </div>
        {total > schools.length && (
          <Link href="/find-schools" className={styles.seeAll}>
            See all {total} <ArrowRightIcon size={13} />
          </Link>
        )}
      </div>
      <div className={styles.grid}>
        {schools.map((school, i) => (
          <SchoolCard key={school.id} school={school} index={i} />
        ))}
      </div>
    </section>
  )
}
