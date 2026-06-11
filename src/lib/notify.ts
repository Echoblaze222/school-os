import { SupabaseClient } from '@supabase/supabase-js'

export async function notifyRoles(
  supabase: SupabaseClient,
  schoolId: string,
  roles: string[],
  notification: { title: string; body: string; type?: string; action_url?: string }
) {
  // Get all users of those roles in this school
  const { data: targets } = await supabase
    .from('profiles')
    .select('id')
    .eq('school_id', schoolId)
    .in('role', roles)

  if (!targets?.length) return

  const inserts = targets.map(t => ({
    user_id:    t.id,
    title:      notification.title,
    body:       notification.body,
    type:       notification.type ?? 'payment',
    action_url: notification.action_url ?? null,
  }))

  await supabase.from('notifications').insert(inserts)
}