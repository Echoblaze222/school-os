import { getAuthUser } from '@/lib/supabase/authUser'
import { redirect } from 'next/navigation'
import MeetingRoomClient from '@/components/live/MeetingRoomClient'

export default async function SecretaryMeetingRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getAuthUser()
  if (!user) redirect('/login')
  return <MeetingRoomClient meetingId={id} backHref="/dashboard/secretary/meetings" />
}
