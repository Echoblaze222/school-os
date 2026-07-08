// app/api/ai/history/route.ts
// Loads the signed-in user's persisted AI conversation for a given role so
// the chat UI can restore history like a normal AI app (ChatGPT/Claude-style)
// instead of starting from a blank slate every session.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const role = (searchParams.get('role') ?? 'student').toLowerCase()

    const { data: conversation } = await supabase
      .from('ai_conversations')
      .select('id, updated_at')
      .eq('user_id', user.id)
      .eq('role_context', role)
      .eq('is_archived', false)
      .maybeSingle()

    if (!conversation) {
      return NextResponse.json({ conversation_id: null, messages: [] })
    }

    const { data: messages, error } = await supabase
      .from('ai_messages')
      .select('id, role, content, image_url, sent_at')
      .eq('conversation_id', conversation.id)
      .order('sent_at', { ascending: true })
      .limit(100)

    if (error) throw error

    return NextResponse.json({
      conversation_id: conversation.id,
      messages: messages ?? [],
    })
  } catch (err: any) {
    console.error('[AI history] Failed to load history:', err?.message ?? err)
    return NextResponse.json({ error: 'Failed to load history' }, { status: 500 })
  }
}
