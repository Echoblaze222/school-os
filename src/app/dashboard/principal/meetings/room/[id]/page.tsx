import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MeetingRoomClient from '@/components/live/MeetingRoomClient'

export default async function PrincipalMeetingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return <MeetingRoomClient meetingId={id} backHref="/dashboard/principal/meetings" />
}
