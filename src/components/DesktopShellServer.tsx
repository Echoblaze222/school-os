// components/DesktopShellServer.tsx
// Server wrapper that mounts the desktop sidebar on pages that have their own
// bespoke header and therefore never went through RoleSubHeader or RoleNav.
// Used from small route-segment layouts, so those pages need no edits.
//
// Only plain data crosses to the client: the shell resolves its menu from the
// role registry on the client side (icons are components and are not
// serialisable from a server component).

import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { getFeatureGroups } from '@/lib/roleFeatureGroups'
import DesktopShell from './DesktopShell'

export default async function DesktopShellServer({ role }: { role: string }) {
  if (!getFeatureGroups(role)) return null

  const user = await getAuthUser()
  if (!user) return null // the page itself handles the redirect

  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url, schools(name, logo_url)')
    .eq('id', user.id)
    .single()

  const rawSchool = (profile as any)?.schools
  const school = Array.isArray(rawSchool) ? rawSchool[0] : rawSchool

  return (
    <DesktopShell
      role={role}
      profile={{ full_name: (profile as any)?.full_name ?? null, avatar_url: (profile as any)?.avatar_url ?? null }}
      school={school ? { name: school.name ?? null, logo_url: school.logo_url ?? null } : null}
    />
  )
}
