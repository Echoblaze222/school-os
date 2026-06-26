// Student layout — applies school branding AND enforces subscription gate.
// If the school's setup_status is expired/suspended/locked, every student
// page is replaced with a SubscriptionGate screen. The principal must
// renew — no code changes needed to unlock, it happens automatically.

import { createClient } from '@/lib/supabase/server'
import SchoolBrandInjector from '@/components/SchoolBrandInjector'
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

  let primaryColor  = '#7C3AED'
  let fontFamily    = 'Inter'
  let setupStatus   = 'active'
  let schoolName    = 'Your School'

  if (user) {
    const { data: profileWithSchool } = await supabase
      .from('profiles')
      .select('schools(name, primary_color, font_family, setup_status)')
      .eq('id', user.id)
      .single()

    const school = (profileWithSchool as any)?.schools
    if (school?.primary_color) primaryColor = school.primary_color
    if (school?.font_family)   fontFamily   = school.font_family
    if (school?.setup_status)  setupStatus  = school.setup_status
    if (school?.name)          schoolName   = school.name
  }

  const isBlocked = BLOCKED_STATUSES.includes(setupStatus)

  return (
    <>
      <SchoolBrandInjector primaryColor={primaryColor} fontFamily={fontFamily} />

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
