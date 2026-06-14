import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ChatRoomClient from '@/app/dashboard/student/chat/[roomId]/ChatRoomClient'

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await params

  const supabase =await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('*, schools(*)').eq('id', user.id).single()
  const school = (profile as any)?.schools ?? null

  return (
    <ChatRoomClient
      roomId={roomId} userId={user.id}
      role="secretary" school={school}
    />
  )
}