// src/app/dashboard/parent/child/page.tsx
// PARENT FIX: accept ?id= query param so parent can view any of their linked children
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChildClient from './ChildClient'

interface PageProps {
  searchParams: Promise<{ id?: string }>
}

export default async function ChildPage({ searchParams }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null

  // PARENT FIX: pass the ?id= param down so ChildClient knows which child to show
  const params = await searchParams
  const childId = params?.id ?? null

  return <ChildClient profile={profile} school={school} userId={user.id} childId={childId} />
}
