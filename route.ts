// src/app/api/examination/quizzes/[quizId]/event/route.ts
// -------------------------------------------------------
// §17-18 of the CBT spec: reasonable browser-level deterrents (tab
// hidden, window blur, fullscreen exit, copy/paste) get logged for
// later review — but NEVER used here to automatically fail or flag a
// student. This route only records; a human (invigilator/teacher)
// decides what, if anything, an event pattern means.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'

const VALID_TYPES = [
  'tab_hidden', 'window_blur', 'window_focus', 'fullscreen_exit',
  'copy_attempt', 'paste_attempt', 'disconnect', 'reconnect', 'resume',
]

export async function POST(req: Request, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const rl = await checkRateLimit(admin, 'cbt_event', user.id, 120, 300)
  if (!rl.allowed) return NextResponse.json({ ok: false, error: rl.errorResponse!.error }, { status: rl.errorResponse!.status })

  let body: { eventType?: string; metadata?: Record<string, any> }
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Bad request.' }, { status: 400 }) }

  if (!body.eventType || !VALID_TYPES.includes(body.eventType)) {
    return NextResponse.json({ ok: false, error: 'Unknown event type.' }, { status: 400 })
  }

  const { data: attempt } = await admin
    .from('quiz_attempts').select('id').eq('quiz_id', quizId).eq('student_id', user.id).maybeSingle()
  if (!attempt) return NextResponse.json({ ok: true }) // no attempt yet — nothing to attach to, not an error

  await admin.from('quiz_attempt_events').insert({
    attempt_id: attempt.id, event_type: body.eventType,
    metadata: body.metadata ?? {},
  }).then(() => {}, () => {}) // best-effort audit log, never blocks the exam UI

  return NextResponse.json({ ok: true })
}
