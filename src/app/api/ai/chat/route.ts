// app/api/ai/chat/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { messages, userId, schoolId } = await req.json()
    if (!messages?.length) return NextResponse.json({ error: 'No messages provided' }, { status: 400 })

    // Convert to Anthropic format (FIX: use 'assistant' not 'model')
    const formattedMessages = messages.map((m: any) => ({
      role:    m.role === 'model' ? 'assistant' : m.role, // FIX: handle both formats
      content: m.content,
    }))

    // Get student profile for context
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, class_level, school_id')
      .eq('id', userId)
      .single()

    const systemPrompt = `You are SchoolOS AI Tutor — a helpful, encouraging educational assistant for Nigerian secondary school students.
    
Student: ${profile?.full_name ?? 'Student'}
Class Level: ${profile?.class_level ?? 'Secondary School'}
Curriculum: Nigerian (WAEC/NECO/JAMB standards)

Your role:
- Explain concepts clearly and simply in a way that matches their level
- Use Nigerian examples and contexts when relevant  
- Encourage and motivate students
- Help with all subjects: Mathematics, English, Sciences, Social Studies, etc.
- Break down complex topics into easy steps
- Use emojis sparingly to make responses friendly
- Keep responses focused and not overly long
- If asked non-academic questions, gently redirect to study topics

Always respond in clear, helpful English.`

    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   formattedMessages,
    })

    // Save to AI conversation storage
    await supabase.from('ai_conversations').upsert({
      user_id:    userId,
      school_id:  schoolId ?? profile?.school_id,
      messages:   formattedMessages,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    return NextResponse.json(response)
  } catch (err: any) {
    console.error('AI chat error:', err)
    return NextResponse.json(
      { error: err.message ?? 'AI service error' },
      { status: 500 }
    )
  }
}
