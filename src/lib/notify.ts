// src/lib/notify.ts
// ─────────────────────────────────────────────────────────────────────────────
// FIX: notifyRoles() only inserted rows into the notifications table but never
//      fired Web Push. Users with push enabled received no device alert.
//      Now calls pushNotifyMany() (fire-and-forget) after a successful insert.
//
//      This affects: payment notifications (bursar cash payment route),
//      assignment creation, result publishing, and any other server-side code
//      that calls notifyRoles().
// ─────────────────────────────────────────────────────────────────────────────

import { SupabaseClient } from '@supabase/supabase-js'
import { pushNotifyMany } from '@/lib/pushNotify'

export async function notifyRoles(
  supabase: SupabaseClient,
  schoolId: string,
  roles: string[],
  notification: { title: string; body: string; type?: string; action_url?: string }
) {
  // 1. Fetch all target users in this school with the given roles
  const { data: targets } = await supabase
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .in('role', roles)

  if (!targets?.length) return

  const inserts = targets.map(t => ({
    user_id:    t.id,
    school_id:  schoolId,
    title:      notification.title,
    body:       notification.body,
    type:       notification.type ?? 'system',
    action_url: notification.action_url ?? null,
  }))

  // 2. Insert in-app notifications
  const { error } = await supabase.from('notifications').insert(inserts)
  if (error) {
    console.error('[notifyRoles] insert error:', error.message)
    return
  }

  // 3. Fire Web Push to all targets — non-blocking, best-effort
  const userIds = targets.map(t => t.id)
  pushNotifyMany(userIds, {
    title: notification.title,
    body:  notification.body,
    url:   notification.action_url ?? '/',
    tag:   notification.type ?? 'system',
  })
    }
    
