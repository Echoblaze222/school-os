// src/app/dashboard/student/layout.tsx
// Applies school branding AND enforces the subscription gate.
// If the school's setup_status is expired/suspended/locked, every student
// page is replaced with a SubscriptionGate screen. The principal must
// renew — no code changes needed to unlock, it happens automatically.
//
// primary_color, secondary_color, and font_family all live directly on the
// `schools` table (added via the schools-branding-columns migration — see
// src/lib/supabase/types.ts).

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'

// Force fully dynamic, per-request rendering with no caching of any kind.
// This layout reads the signed-in user's school (brand colours, role data)
// from cookies on every request. Without this, Next.js can cache the
// rendered output/data for this route and reuse it across different users
// or sessions hitting the same URL — which is what caused stale brand
// colours after a refresh, and briefly showed one signed-in user's
// dashboard to the next person who logs in on the same device.
export const dynamic    = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0
import SubscriptionGate from '@/components/SubscriptionGate'

// Statuses that block student access
const BLOCKED_STATUSES = ['expired', 'suspended', 'locked']

export default async function StudentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let primaryColor   = '#7C3AED'
  let secondaryColor: string | undefined
  let fontFamily      = 'Inter'
  let setupStatus     = 'active'
  let schoolName       = 'Your School'

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('schools(name, primary_color, secondary_color, font_family, setup_status)')
      .eq('id', user.id)
      .single()

    const school = (profile as any)?.schools
    if (school?.primary_color)   primaryColor   = school.primary_color
    if (school?.secondary_color) secondaryColor = school.secondary_color
    if (school?.font_family)     fontFamily     = school.font_family
    if (school?.setup_status)    setupStatus    = school.setup_status
    if (school?.name)            schoolName     = school.name
  }

  const isBlocked = BLOCKED_STATUSES.includes(setupStatus)

  return (
    <>
      <SchoolBrandInjector primaryColor={primaryColor} secondaryColor={secondaryColor} fontFamily={fontFamily} />

      {isBlocked ? (
        // Replace ALL child pages with the gate screen
        <SubscriptionGate
          schoolName={schoolName}
          schoolColor={primaryColor}
          status={setupStatus}
        />
      ) : (
        children
      )}
    </>
  )
}
