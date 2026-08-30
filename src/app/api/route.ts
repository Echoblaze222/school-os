// src/app/api/examination/quizzes/[quizId]/autosave/route.ts
// -------------------------------------------------------
// Persists answers as the student picks them, so a crashed browser,
// dead battery, or dropped Wi-Fi never loses progress the way the old
// client-only `answers` React state did. Client debounces calls; this
// route just needs to be safe to call often and safe to call after
// expiry (it won't silently accept writes to a closed attempt).
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { finalizeIfExpired } from '@/lib/cbt/attempt'

export async function PATCH(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const rl = await checkRateLimit(admin, 'cbt_autosave', user.id, 240, 300)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })

  let body: { answers?: Record<string, string> }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: "Couldn't read the request body." }, { status: 400 }) }

  const incoming = body.answers ?? {}
  if (Object.keys(incoming).length === 0) {
    return NextResponse.json({ ok: false, error: 'No answers provided.' }, { status: 400 })
  }
  if (Object.keys(incoming).length > 300) {
    return NextResponse.json({ ok: false, error: 'Too many answers in one request.' }, { status: 400 })
  }

  const { data: attempt } = await admin
    .from('quiz_attempts')
    .select('id, status, expires_at, answers')
    .eq('quiz_id', quizId).eq('student_id', user.id).maybeSingle()

  if (!attempt) return NextResponse.json({ ok: false, error: 'No active attempt found. Start the quiz first.' }, { status: 404 })

  const { finalized } = await finalizeIfExpired(admin, {
    id: attempt.id, quiz_id: quizId, status: attempt.status,
    expires_at: attempt.expires_at, answers: attempt.answers ?? {},
  })
  if (finalized || attempt.status !== 'in_progress') {
    return NextResponse.json({ ok: false, error: 'Time is up. Your quiz was already submitted.', expired: true }, { status: 409 })
  }

  const mergedAnswers = { ...(attempt.answers ?? {}), ...incoming }
  const { error } = await admin.from('quiz_attempts').update({
    answers: mergedAnswers, last_activity_at: new Date().toISOString(),
  }).eq('id', attempt.id).eq('status', 'in_progress') // belt-and-suspenders: no-op if it flipped out from under us

  if (error) return NextResponse.json({ ok: false, error: `Autosave failed: ${error.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, savedAt: new Date().toISOString() })
}
