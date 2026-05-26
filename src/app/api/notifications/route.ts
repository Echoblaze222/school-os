// app/api/notifications/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - fetch notifications for current user
export async function GET(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit  = parseInt(searchParams.get('limit')  ?? '20')
  const unread = searchParams.get('unread') === 'true'

  let query = supabase
    .from('notifications')
    .select('id, title, body, type, is_read, created_at, action_url')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unread) query = query.eq('is_read', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .eq('is_read', false)

  return NextResponse.json({ notifications: data, unreadCount: count ?? 0 })
}

// PATCH - mark notifications as read
export async function PATCH(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids, markAll } = await req.json()

  if (markAll) {
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', session.user.id)
      .eq('is_read', false)
  } else if (ids?.length) {
    await supabase.from('notifications')
      .update({ is_read: true })
      .in('id', ids)
      .eq('user_id', session.user.id)
  }

  return NextResponse.json({ ok: true })
}

// POST - create notification (server-to-server only)
export async function POST(req: Request) {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { user_id, title, body, type, action_url } = await req.json()
  if (!user_id || !title || !body) {
    return NextResponse.json({ error: 'user_id, title and body are required' }, { status: 400 })
  }

  const { data, error } = await supabase.from('notifications').insert({
    user_id, title, body, type: type ?? 'system', action_url,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ notification: data })
}
