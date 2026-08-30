// src/app/dashboard/examination/chat/page.tsx
// Same thin-wrapper shape as every other role's chat page. Gated via
// getExamContext, same as every other page under dashboard/examination/,
// which already redirects non-committee, non-principal users before this
// component body runs.

import { getExamContext } from '@/lib/supabase/getExamContext'
import UniversalChatPage from '@/components/UniversalChatPage'

export default async function ExaminationChatPage() {
  const { profile, school, userId } = await getExamContext()
  const schoolColor = school?.primary_color ?? '#7C3AED'

  return (
    <UniversalChatPage
      profile={profile} school={school}
      userId={userId} role="examination"
      schoolColor={schoolColor}
    />
  )
}
