// lib/subscriptionExpiry.ts
//
// Single source of truth for auto-expiring trials and suspending lapsed
// subscriptions. Extracted out of /api/trial/check so it can be driven by
// a real cron job (checks EVERY school) instead of only running when a
// student happens to load their dashboard.
//
// Accepts any Supabase client (server client or admin/service-role client)
// so it works both from a user-scoped route and from the cron job.

export interface SchoolExpiryRow {
  id: string
  name: string
  setup_status: 'trial' | 'active' | 'expired' | 'suspended' | 'locked' | string
  trial_ends_at: string | null
  free_month_ends: string | null
  subscription_ends: string | null
}

export async function evaluateSchoolSubscription(supabase: any, school: SchoolExpiryRow) {
  const now = Date.now()
  let updated = false
  let newStatus = school.setup_status

  // ── Auto-expire trial ────────────────────────────────────
  if (school.setup_status === 'trial' && school.trial_ends_at) {
    if (new Date(school.trial_ends_at).getTime() < now) {
      await supabase.from('schools')
        .update({ setup_status: 'expired' }).eq('id', school.id)
      updated = true
      newStatus = 'expired'

      const { data: principal } = await supabase
        .from('profiles').select('id').eq('school_id', school.id).eq('role', 'principal').single()
      if (principal) {
        await supabase.from('notifications').insert({
          user_id: principal.id,
          title:   '⏰ Trial Expired',
          body:    `Your ${school.name} free trial has ended. Contact SchoolOS to pay for permanent setup and continue using the portal.`,
          type:    'system',
        })
      }
    }
  }

  // ── Auto-expire subscription ─────────────────────────────
  if (school.setup_status === 'active' && school.subscription_ends) {
    if (new Date(school.subscription_ends).getTime() < now) {
      await supabase.from('schools')
        .update({ setup_status: 'suspended' }).eq('id', school.id)
      updated = true
      newStatus = 'suspended'

      const { data: principal } = await supabase
        .from('profiles').select('id').eq('school_id', school.id).eq('role', 'principal').single()
      if (principal) {
        await supabase.from('notifications').insert({
          user_id: principal.id,
          title:   '⚠️ Subscription Suspended',
          body:    `${school.name}'s subscription for this term has ended. Renew now to restore full access for your staff and students.`,
          type:    'system',
          action_url: '/dashboard/principal/subscriptions',
        })
      }
    }
  }

  // ── Send trial reminders (Day 9, 7, 3) ──────────────────
  if (school.setup_status === 'trial' && school.trial_ends_at) {
    const trialEnd = new Date(school.trial_ends_at).getTime()
    const daysLeft  = Math.ceil((trialEnd - now) / 86400000)
    const { data: principal } = await supabase
      .from('profiles').select('id').eq('school_id', school.id).eq('role', 'principal').single()

    for (const day of [9, 7, 3]) {
      if (daysLeft <= day) {
        const { data: sent } = await supabase
          .from('trial_reminders')
          .select('id').eq('school_id', school.id).eq('day_trigger', day).single()

        if (!sent && principal) {
          await supabase.from('trial_reminders').insert({
            school_id: school.id, day_trigger: day,
          })
          const urgency = day <= 3 ? '🚨 URGENT' : day <= 7 ? '⚠️' : 'ℹ️'
          await supabase.from('notifications').insert({
            user_id: principal.id,
            title:   `${urgency} Trial ends in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
            body:    daysLeft <= 1
              ? `Your SchoolOS trial expires TODAY. Pay for setup NOW to keep all your data and continue using the portal.`
              : `Your SchoolOS free trial ends in ${daysLeft} days. Pay for permanent setup to avoid losing access. All features + 1 month free after payment.`,
            type:    'system',
            action_url: '/dashboard/principal/subscriptions',
          })
        }
      }
    }
  }

  // ── Update trial activity score ──────────────────────────
  if (school.setup_status === 'trial') {
    const { count: loginCount } = await supabase
      .from('profiles')
      .select('last_sign_in_at', { count: 'exact', head: true })
      .eq('school_id', school.id)
      .not('last_sign_in_at', 'is', null)

    const score = Math.min(100, Math.round(((loginCount ?? 0) / 5) * 100))
    await supabase.from('schools').update({ trial_active_score: score }).eq('id', school.id)
  }

  return { updated, status: newStatus }
}
