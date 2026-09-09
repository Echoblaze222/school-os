import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/public/PublicNav'
import PublicFooter from '@/components/public/PublicFooter'
import Hero from '@/components/public/landing/Hero'
import ValueProps from '@/components/public/landing/ValueProps'
import AudienceSection from '@/components/public/landing/AudienceSection'
import StatsStrip from '@/components/public/landing/StatsStrip'
import FeaturedSchools from '@/components/public/landing/FeaturedSchools'
import PromotionsSection from '@/components/public/landing/PromotionsSection'
import FaqSection from '@/components/public/landing/FaqSection'
import FinalCta from '@/components/public/landing/FinalCta'

const ROLE_ROUTES: Record<string, string> = {
  student:   '/dashboard/student',
  teacher:   '/dashboard/teacher',
  principal: '/dashboard/principal',
  bursar:    '/dashboard/bursar',
  secretary: '/dashboard/secretary',
  parent:    '/dashboard/parent',
  admin:     '/admin',
}

export default async function RootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    redirect(ROLE_ROUTES[profile?.role ?? ''] ?? '/login')
  }

  // No session: this is the public marketing landing page (Lane A, S38).
  // The cinematic /splash entrance still exists and now plays when a
  // visitor actually chooses to log in, rather than gating everyone
  // before they have seen anything about the product.
  //
  // Section rhythm is controlled by `gap` on this flex container instead
  // of a manual spacer <div> between every section. Several sections
  // (StatsStrip, PromotionsSection) already conditionally render null
  // when there's no data - with spacer divs, a null section still left
  // its neighboring spacer in place, producing an inconsistent gap
  // whenever content was actually absent. `gap` only applies between
  // siblings that actually render, so it self-corrects.
  //
  // PromotionsSection + StatsStrip are grouped in their own wrapper so
  // they keep sitting flush against each other (no gap), which was the
  // original, presumably intentional layout - the outer gap still
  // applies normally around that pair as a single unit.
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNav />
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
        <Hero />
        <div>
          <PromotionsSection />
          <StatsStrip />
        </div>
        <ValueProps />
        <AudienceSection />
        <FeaturedSchools />
        <FaqSection />
        <FinalCta />
      </main>
      <PublicFooter />
    </div>
  )
}
