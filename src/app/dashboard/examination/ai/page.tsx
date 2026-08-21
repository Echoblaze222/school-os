// src/app/dashboard/examination/ai/page.tsx
//
// getExamContext() redirects to /login if unauthenticated, same as every
// other page under /dashboard/examination. The AI route's own examination
// branch re-checks committee membership independently before attaching
// any live exam data to the prompt, so this page-level gate is never the
// only thing standing between an unauthorized caller and real data.

import { getExamContext } from '@/lib/supabase/getExamContext'
import UniversalAIPage from '@/components/UniversalAIPage'

export default async function ExaminationAiPage() {
  const { userId, profile, school } = await getExamContext()
  return <UniversalAIPage profile={profile} school={school} userId={userId} role="examination" />
}
