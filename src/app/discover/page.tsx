// src/app/discover/page.tsx
// Lane E - public discovery feed. Server-rendered so it works without JS
// and so search engines can index it; reads directly via the admin client
// rather than round-tripping through /api/public/promotions from the
// server (that API route exists for client-side use, e.g. "load more").
import { createAdminClient } from '@/lib/supabase/admin'
import PublicHeader from './PublicHeader'
import styles from './public.module.css'
import PromotionCard from './PromotionCard'

export const revalidate = 60 // public feed, safe to cache briefly

const TYPE_FILTERS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'admission', label: 'Admissions' },
  { key: 'open_day', label: 'Open Days' },
  { key: 'scholarship', label: 'Scholarships' },
  { key: 'event', label: 'Events' },
  { key: 'boarding', label: 'Boarding' },
]

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>
}) {
  const { type } = await searchParams
  const supabase = createAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  let query = supabase
    .from('school_promotions')
    .select(`
      id, promotion_type, title, summary, image_url, external_link,
      is_sponsored, schools ( name, city, state, logo_url )
    `)
    .eq('status', 'live')
    .lte('start_date', today)
    .gte('end_date', today)
    .order('is_sponsored', { ascending: false })
    .order('start_date', { ascending: false })
    .limit(30)

  if (type) query = query.eq('promotion_type', type)

  const { data: promotions, error } = await query

  return (
    <>
      <PublicHeader active="discover" />
      <main className={styles.page}>
        <h1 className={styles.pageTitle}>Discover Schools</h1>
        <p className={styles.pageSubtitle}>
          Admissions, open days, scholarships, and events shared directly by schools on SchoolOS.
          Sponsored placements are always labeled and never affect a school&apos;s ranking.
        </p>

        <div className={styles.filterRow}>
          {TYPE_FILTERS.map((f) => (
            <a
              key={f.key}
              href={f.key ? `/discover?type=${f.key}` : '/discover'}
              className={(type || '') === f.key ? styles.filterChipActive : styles.filterChip}
            >
              {f.label}
            </a>
          ))}
        </div>

        {error && <p className={styles.emptyState}>Couldn&apos;t load promotions right now. Please try again shortly.</p>}

        {!error && (!promotions || promotions.length === 0) && (
          <p className={styles.emptyState}>
            No promotions are live right now. Check back soon, or explore rankings instead.
          </p>
        )}

        {!error && promotions && promotions.length > 0 && (
          <div className={styles.grid}>
            {promotions.map((p: any) => (
              <PromotionCard key={p.id} promotion={p} />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
