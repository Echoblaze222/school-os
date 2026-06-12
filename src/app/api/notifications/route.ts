// src/app/api/notifications/route.ts
// ─────────────────────────────────────────────────────────────────────────────
// Updated version: fires a Web Push after every successful notification insert.
// Replace the existing file with this one.
// ─────────────────────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { pushNotify } from '@/lib/pushNotify'

// GET - fetch notifications for current user
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const limit  = parseInt(searchParams.get('limit')  ?? '20')
  const unread = searchParams.get('unread') === 'true'

  let query = supabase
    .from('notifications')
    .select('id, title, body, type, is_read, created_at, action_url')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (unread) query = query.eq('is_read', false)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('is_read', false)

  return NextResponse.json({ notifications: data, unreadCount: count ?? 0 })
}

// PATCH - mark notifications as read
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ids, markAll } = await req.json()

  if (markAll) {
    await supabase.from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
  } else if (ids?.length) {
    await supabase.from('notifications')
      .update({ is_read: true })
      .in('id', ids)
      .eq('user_id', user.id)
  }

  return NextResponse.json({ ok: true })
}

// POST - create notification + fire push
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { user_id, title, body, type, action_url } = await req.json()
  if (!user_id || !title || !body) {
    return NextResponse.json({ error: 'user_id, title and body are required' }, { status: 400 })
  }

  const { data, error } = await supabase.from('notifications').insert({
    user_id, title, body, type: type ?? 'system', action_url,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 🔔 Fire Web Push — non-blocking, best-effort
  pushNotify(user_id, {
    title,
    body,
    url:  action_url ?? '/',
    tag:  type ?? 'system',
  })

  return NextResponse.json({ notification: data })
}

// DELETE - delete a notification
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json()
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  await supabase.from('notifications').delete().eq('id', id).eq('user_id', user.id)
  return NextResponse.json({ ok: true })
}
