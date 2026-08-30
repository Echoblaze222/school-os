// src/app/api/examination/quizzes/[quizId]/status/route.ts
// -------------------------------------------------------
// Lightweight poll the client can call periodically (e.g. every 20-30s)
// to reconcile its local countdown display against the server clock.
// The client's own countdown is cosmetic only — this route (and the
// expiry check inside autosave/submit) is what actually enforces time.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { finalizeIfExpired } from '@/lib/cbt/attempt'

export async function GET(_req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: attempt } = await admin
    .from('quiz_attempts')
    .select('id, status, expires_at, score, max_score, percentage, passed')
    .eq('quiz_id', quizId).eq('student_id', user.id).maybeSingle()

  if (!attempt) return NextResponse.json({ ok: true, attempt: null, serverNow: new Date().toISOString() })

  const { finalized } = await finalizeIfExpired(admin, {
    id: attempt.id, quiz_id: quizId, status: attempt.status,
    expires_at: attempt.expires_at, answers: {},
  })

  const { data: fresh } = finalized
    ? await admin.from('quiz_attempts').select('id, status, expires_at, score, max_score, percentage, passed').eq('id', attempt.id).single()
    : { data: attempt }

  return NextResponse.json({
    ok: true,
    attempt: {
      id: fresh!.id, status: fresh!.status, expiresAt: fresh!.expires_at,
      score: fresh!.score, maxScore: fresh!.max_score, percentage: fresh!.percentage, passed: fresh!.passed,
    },
    serverNow: new Date().toISOString(),
  })
}
