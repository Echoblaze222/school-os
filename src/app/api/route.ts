// src/app/api/study-plan/regenerate/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

interface GeneratedBlock {
  day_of_week: string
  subject: string
  topic: string
  start_time: string
  duration_minutes: number
}

export async function POST() {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Derive week start (Monday)
  const today = new Date()
  const dow = today.getDay()
  const toMonday = dow === 0 ? -6 : 1 - dow
  const monday = new Date(today)
  monday.setDate(today.getDate() + toMonday)
  monday.setHours(0, 0, 0, 0)
  const weekStartStr = monday.toISOString().split('T')[0]

  // Gather subject list from student's results history
  const { data: resultsData } = await supabase
    .from('results')
    .select('subject')
    .eq('student_id', user.id)
    .limit(50)

  const rawSubjects = (resultsData ?? []).map((r: { subject: string }) => r.subject).filter(Boolean)
  const subjects = [...new Set(rawSubjects)]

  const subjectList =
    subjects.length > 0
      ? subjects.join(', ')
      : 'Mathematics, English Language, Physics, Chemistry, Biology, Geography'

  // ── Claude prompt ──────────────────────────────────────
  const prompt = `You are an expert academic planner. Generate a weekly study timetable for a student.

Subjects to cover: ${subjectList}

Return ONLY a valid JSON array. No markdown fences, no explanation. Each object must have exactly these keys:
- "day_of_week": string (one of: Monday, Tuesday, Wednesday, Thursday, Friday, Saturday)
- "subject": string (from the list above)
- "topic": string (a specific, focused study topic — e.g. "Quadratic Equations Practice" not just "Maths")
- "start_time": string (24-hour format "HH:MM", between 06:00 and 22:00)
- "duration_minutes": number (one of: 30, 45, 60, 90)

Rules:
- 3–4 sessions per weekday (Monday–Friday), 1–2 on Saturday
- No two sessions on the same day may overlap (check start_time + duration_minutes)
- Spread subjects evenly across the week
- Topics must be specific and academic
- Start times must be realistic (e.g. mornings from 07:00, evening cap at 20:30)
- Output the JSON array directly — nothing else`

  let aiBlocks: GeneratedBlock[] = []

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    })

    const rawText = message.content
      .filter(b => b.type === 'text')
      .map(b => (b as { type: 'text'; text: string }).text)
      .join('')

    const clean = rawText.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)

    if (!Array.isArray(parsed)) throw new Error('AI did not return an array')

    // Validate each block shape
    aiBlocks = parsed.filter(
      (b: unknown): b is GeneratedBlock =>
        typeof b === 'object' &&
        b !== null &&
        typeof (b as GeneratedBlock).day_of_week === 'string' &&
        typeof (b as GeneratedBlock).subject === 'string' &&
        typeof (b as GeneratedBlock).topic === 'string' &&
        typeof (b as GeneratedBlock).start_time === 'string' &&
        typeof (b as GeneratedBlock).duration_minutes === 'number'
    )

    if (aiBlocks.length === 0) throw new Error('No valid blocks in AI response')
  } catch (err) {
    console.error('[regenerate] AI error:', err)
    return NextResponse.json({ error: 'AI generation failed. Please try again.' }, { status: 500 })
  }

  // Delete existing schedule for this week
  const { error: deleteError } = await supabase
    .from('study_schedules')
    .delete()
    .eq('student_id', user.id)
    .eq('week_start', weekStartStr)

  if (deleteError) {
    console.error('[regenerate] delete error:', deleteError.message)
    return NextResponse.json({ error: 'Failed to clear old schedule.' }, { status: 500 })
  }

  // Insert new blocks
  const toInsert = aiBlocks.map(b => ({
    student_id: user.id,
    week_start: weekStartStr,
    day_of_week: b.day_of_week,
    subject: b.subject,
    topic: b.topic,
    start_time: b.start_time,
    duration_minutes: b.duration_minutes,
  }))

  const { error: insertError } = await supabase
    .from('study_schedules')
    .insert(toInsert)

  if (insertError) {
    console.error('[regenerate] insert error:', insertError.message)
    return NextResponse.json({ error: 'Failed to save new schedule.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, count: toInsert.length })
}
