// app/api/study-plan/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const DAYS    = ['Mon','Tue','Wed','Thu','Fri','Sat']
const COLORS  = ['#7C3AED','#3B82F6','#10B981','#F59E0B','#EF4444','#EC4899','#06B6D4','#8B5CF6']
const TIMES   = ['08:00','09:00','10:00','11:00','14:00','15:00','16:00','17:00','19:00','20:00']

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { userId, schoolId, classLevel } = await req.json()

    // Get student's subjects from timetable/syllabus
    const { data: subjects } = await supabase
      .from('timetable')
      .select('subject')
      .eq('school_id', schoolId)
      .eq('class_level', classLevel)
      .limit(20)

    const subjectList = subjects?.map(s => s.subject) ?? [
      'Mathematics', 'English Language', 'Physics', 'Chemistry',
      'Biology', 'Economics', 'Government', 'Literature',
    ]

    const uniqueSubjects = [...new Set(subjectList)].slice(0, 8)

    const prompt = `Create a balanced weekly study plan for a Nigerian secondary school student in ${classLevel || 'SS2'}.
Subjects to cover: ${uniqueSubjects.join(', ')}.
Rules:
- Spread subjects across Mon-Sat
- Each session 45-90 minutes
- No more than 2 subjects per day
- Mix difficult and easier subjects
- Leave Sunday free
- Morning (08:00-11:00) for harder subjects, afternoon/evening for revision

Return ONLY valid JSON array with objects: { day, subject, time, duration_mins }
Example: [{"day":"Mon","subject":"Mathematics","time":"08:00","duration_mins":60}]
Generate 10-12 sessions total.`

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages:   [{ role:'user', content:prompt }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : '[]'

    // Parse JSON safely
    let plan: any[] = []
    try {
      const match = text.match(/\[[\s\S]*\]/)
      if (match) plan = JSON.parse(match[0])
    } catch {}

    // Assign colors
    const subjectColorMap: Record<string, string> = {}
    uniqueSubjects.forEach((s, i) => { subjectColorMap[s] = COLORS[i % COLORS.length] })

    const planWithColors = plan.map(p => ({
      ...p,
      color: subjectColorMap[p.subject] ?? COLORS[0],
    }))

    return NextResponse.json({ plan: planWithColors, subjects: uniqueSubjects })
  } catch (err: any) {
    console.error('Study plan error:', err)
    return NextResponse.json({ error: err.message ?? 'Failed to generate plan' }, { status: 500 })
  }
}
