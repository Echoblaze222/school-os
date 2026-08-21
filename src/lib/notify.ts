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

async function deliver(
  supabase: SupabaseClient,
  schoolId: string,
  userIds: string[],
  notification: { title: string; body: string; type?: string; action_url?: string },
  errorLabel: string,
) {
  if (!userIds.length) return

  const inserts = userIds.map(id => ({
    user_id:    id,
    school_id:  schoolId,
    title:      notification.title,
    body:       notification.body,
    type:       notification.type ?? 'system',
    action_url: notification.action_url ?? null,
  }))

  const { error } = await supabase.from('notifications').insert(inserts)
  if (error) {
    console.error(`[${errorLabel}] insert error:`, error.message)
    return
  }

  pushNotifyMany(userIds, {
    title: notification.title,
    body:  notification.body,
    url:   notification.action_url ?? '/',
    tag:   notification.type ?? 'system',
  })
}

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
  await deliver(supabase, schoolId, targets.map(t => t.id), notification, 'notifyRoles')
}

/**
 * Notify every active holder of one or more appointment types (VP, HOD,
 * Counselor, ICT Officer, Warden, etc.) rather than a base profiles.role -
 * see appointments.ts getAppointeesByType, which this mirrors, and
 * identity-appointments-schema.sql for the appointments table itself.
 * "Active" only: a revoked/expired appointment never receives these.
 */
export async function notifyAppointmentHolders(
  supabase: SupabaseClient,
  schoolId: string,
  appointmentTypes: string[],
  notification: { title: string; body: string; type?: string; action_url?: string },
  options?: { alsoNotifyPrincipal?: boolean },
) {
  const { data: holders, error } = await supabase
    .from('appointments')
    .select('profile_id')
    .eq('school_id', schoolId)
    .eq('status', 'active')
    .in('appointment_type', appointmentTypes)

  if (error) {
    console.error('[notifyAppointmentHolders] query error:', error.message)
    return
  }

  // De-dupe - a profile can hold more than one of the requested appointment
  // types at once and should still only get one notification.
  const userIds = [...new Set((holders ?? []).map(h => h.profile_id))]
  if (userIds.length) {
    await deliver(supabase, schoolId, userIds, notification, 'notifyAppointmentHolders')
  }

  // Escalation path (e.g. high/urgent ICT tickets) - Principal is a base
  // profiles.role, not an appointment, so this goes through notifyRoles
  // rather than another appointments query.
  if (options?.alsoNotifyPrincipal) {
    await notifyRoles(supabase, schoolId, ['principal'], notification)
  }
}
