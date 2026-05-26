import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatRoomClient from '@/app/dashboard/student/chat/[roomId]/ChatRoomClient'

export default async function ChatRoomPage({ params }: { params: { roomId: string } }) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', session.user.id).single()
  const school = (profile as any)?.schools ?? null
  return (
    <ChatRoomClient
      roomId={params.roomId} userId={session.user.id}
      role="student" school={school}
    />
  )
}
