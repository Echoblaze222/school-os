// src/app/dashboard/principal/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PrincipalDashboardClient from './PrincipalDashboardClient'

function getCurrentTermAndYear() {
  const now   = new Date()
  const month = now.getMonth()
  const year  = now.getFullYear()

  let term: string
  let academicYear: string

  if (month >= 8) {
    term         = 'First Term'
    academicYear = `${year}/${year + 1}`
  } else if (month <= 2) {
    term         = 'Second Term'
    academicYear = `${year - 1}/${year}`
  } else {
    term         = 'Third Term'
    academicYear = `${year - 1}/${year}`
  }

  return { term, academicYear }
}

export default async function PrincipalDashboardPage() {
  const supabase =await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school = (profile as any)?.schools ?? null
  return <PrincipalDashboardClient profile={profile} school={school} userId={session.user.id} />
}
