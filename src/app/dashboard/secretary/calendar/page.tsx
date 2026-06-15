// src/app/dashboard/secretary/calendar/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import CalendarClient from './CalendarClient'

export default async function CalendarPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*, schools(*)')
    .eq('id', user.id)
    .single()

  if (!profile || profile.role !== 'secretary') redirect('/login')
  const school = (profile as any)?.schools ?? null

  const { data: events } = await supabase
    .from('events')
    .select('*')
    .eq('school_id', profile.school_id)
    .order('start_date', { ascending: true })

  return <CalendarClient events={events ?? []} profile={profile} school={school} userId={user.id} />
}
