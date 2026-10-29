// src/app/dashboard/student/boarding/page.tsx
import { getAuthUser } from '@/lib/supabase/authUser'
import { redirect }     from 'next/navigation'
import BoardingClient   from './BoardingClient'

export default async function BoardingPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  // No separate "is boarding" flag to check here: the summary route
  // itself confirms an active bed assignment and returns { boarding:
  // false } if there isn't one, which the client turns into a clear
  // message rather than an empty/broken page. Duplicating that check
  // here would just be a second place for the two to drift apart.
  return <BoardingClient />
}
