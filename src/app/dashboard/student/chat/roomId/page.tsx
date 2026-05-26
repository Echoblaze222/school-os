import { redirect } from 'next/navigation'

export default function OldChatRoomPage({ params }: { params: { roomId: string } }) {
  redirect(`/dashboard/student/chat/${params.roomId}`)
}