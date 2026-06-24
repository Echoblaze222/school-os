// src/app/api/push/remind/route.ts
// Saves a scheduled reminder for the current user.
// Called by ReminderButton when user sets a reminder.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function adminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/push/remind
// Body: { source_type, source_id, fire_at, title, body, url }
export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { source_type, source_id, fire_at, title, body, url } = await req.json()

  if (!source_type || !source_id || !fire_at || !title) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  if (new Date(fire_at) <= new Date()) {
    return NextResponse.json({ error: 'Reminder time is in the past' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('school_id')
    .eq('id', user.id)
    .single()

  const admin = adminClient()

  // Remove any existing reminder for this user + source (one reminder per item)
  await admin.from('scheduled_reminders')
    .delete()
    .eq('user_id', user.id)
    .eq('source_id', source_id)
    .eq('fired', false)

  // Save new reminder
  const { error } = await admin.from('scheduled_reminders').insert({
    user_id:     user.id,
    school_id:   profile?.school_id,
    source_type,
    source_id,
    fire_at,
    title,
    body,
    url,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/push/remind
// Body: { source_id }
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { source_id } = await req.json()
  if (!source_id) return NextResponse.json({ error: 'source_id required' }, { status: 400 })

  const admin = adminClient()
  await admin.from('scheduled_reminders')
    .delete()
    .eq('user_id', user.id)
    .eq('source_id', source_id)
    .eq('fired', false)

  return NextResponse.json({ ok: true })
}

// GET /api/push/remind?source_ids=id1,id2,id3
// Returns which source_ids the user has active reminders for
export async function GET(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ reminders: [] })

  const { searchParams } = new URL(req.url)
  const ids = searchParams.get('source_ids')?.split(',').filter(Boolean) ?? []
  if (!ids.length) return NextResponse.json({ reminders: [] })

  const { data } = await supabase
    .from('scheduled_reminders')
    .select('source_id, fire_at')
    .eq('user_id', user.id)
    .eq('fired', false)
    .in('source_id', ids)

  return NextResponse.json({ reminders: data ?? [] })
}
