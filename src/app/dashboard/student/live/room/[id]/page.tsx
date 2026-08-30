import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import RoomClient from './RoomClient'

export default async function StudentLiveRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null
  return <RoomClient onlineClassId={id} userId={user.id} school={school} profile={profile} />
}
