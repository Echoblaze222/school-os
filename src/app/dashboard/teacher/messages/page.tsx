// src/app/dashboard/teacher/messages/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import MessagesClient from './MessagesClient'

export const metadata = { title: 'Messages — SchoolOS' }
export interface ChatRoom { id: string; name: string; type: string; last_message: string | null; last_message_at: string | null; unread_count: number; participant_names: string[] }
export interface UserProfile { id: string; full_name: string; avatar_url: string | null }

export default async function MessagesPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const [profileRes, roomsRes] = await Promise.all([
    supabase.from('teacher_profiles').select('full_name, avatar_url').eq('user_id', user.id).maybeSingle(),
    supabase.from('chat_room_members')
      .select('chat_rooms(id, name, type, last_message, last_message_at)')
      .eq('user_id', user.id)
      .order('chat_rooms(last_message_at)', { ascending: false }),
  ])

  const rooms: ChatRoom[] = (roomsRes.data ?? []).map((r: any) => ({
    id: r.chat_rooms?.id, name: r.chat_rooms?.name ?? 'Chat',
    type: r.chat_rooms?.type ?? 'direct',
    last_message: r.chat_rooms?.last_message ?? null,
    last_message_at: r.chat_rooms?.last_message_at ?? null,
    unread_count: 0, participant_names: [],
  })).filter(r => !!r.id)

  return (
    <MessagesClient
      userId={user.id}
      userName={profileRes.data?.full_name ?? 'Teacher'}
      userAvatar={profileRes.data?.avatar_url ?? null}
      initialRooms={rooms}
    />
  )
}
