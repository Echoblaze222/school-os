import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PublicNav from '@/components/public/PublicNav'
import PublicFooter from '@/components/public/PublicFooter'
import Hero from '@/components/public/landing/Hero'
import ValueProps from '@/components/public/landing/ValueProps'
import AudienceSection from '@/components/public/landing/AudienceSection'
import StatsStrip from '@/components/public/landing/StatsStrip'
import FeaturedSchools from '@/components/public/landing/FeaturedSchools'
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
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <PublicNav />
      <main style={{ flex: 1 }}>
        <Hero />
        <StatsStrip />
        <div style={{ height: 'var(--space-8)' }} />
        <ValueProps />
        <div style={{ height: 'var(--space-8)' }} />
        <AudienceSection />
        <div style={{ height: 'var(--space-8)' }} />
        <FeaturedSchools />
        <div style={{ height: 'var(--space-8)' }} />
        <FaqSection />
        <div style={{ height: 'var(--space-8)' }} />
        <FinalCta />
        <div style={{ height: 'var(--space-8)' }} />
      </main>
      <PublicFooter />
    </div>
  )
}
