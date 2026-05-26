// app/api/trial/check/route.ts
// Called by cron job daily OR on each page load for trial schools
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function POST(req: Request) {
  const supabase = createClient()
  const { schoolId } = await req.json()

  if (!schoolId) return NextResponse.json({ error: 'schoolId required' }, { status: 400 })

  const { data: school } = await supabase
    .from('schools')
    .select('id, name, setup_status, trial_ends_at, free_month_ends, subscription_ends')
    .eq('id', schoolId)
    .single()

  if (!school) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  const now  = Date.now()
  let updated = false

  // ── Auto-expire trial ────────────────────────────────────
  if (school.setup_status === 'trial' && school.trial_ends_at) {
    if (new Date(school.trial_ends_at).getTime() < now) {
      await supabase.from('schools')
        .update({ setup_status: 'expired' }).eq('id', schoolId)
      updated = true

      // Notify principal
      const { data: principal } = await supabase
        .from('profiles').select('id').eq('school_id', schoolId).eq('role', 'principal').single()
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
        .update({ setup_status: 'suspended' }).eq('id', schoolId)
      updated = true
    }
  }

  // ── Send trial reminders (Day 3, 7, 9) ──────────────────
  if (school.setup_status === 'trial' && school.trial_ends_at) {
    const trialEnd  = new Date(school.trial_ends_at).getTime()
    const daysLeft  = Math.ceil((trialEnd - now) / 86400000)
    const { data: principal } = await supabase
      .from('profiles').select('id').eq('school_id', schoolId).eq('role', 'principal').single()

    for (const day of [9, 7, 3]) {
      if (daysLeft <= day) {
        // Check if already sent
        const { data: sent } = await supabase
          .from('trial_reminders')
          .select('id').eq('school_id', schoolId).eq('day_trigger', day).single()

        if (!sent && principal) {
          await supabase.from('trial_reminders').insert({
            school_id: schoolId, day_trigger: day,
          })
          const urgency = day <= 3 ? '🚨 URGENT' : day <= 7 ? '⚠️' : 'ℹ️'
          await supabase.from('notifications').insert({
            user_id: principal.id,
            title:   `${urgency} Trial ends in ${daysLeft} day${daysLeft > 1 ? 's' : ''}`,
            body:    daysLeft <= 1
              ? `Your SchoolOS trial expires TODAY. Pay for setup NOW to keep all your data and continue using the portal.`
              : `Your SchoolOS free trial ends in ${daysLeft} days. Pay for permanent setup to avoid losing access. All features + 1 month free after payment.`,
            type:    'system',
            action_url: '/dashboard/principal/subscription',
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
      .eq('school_id', schoolId)
      .not('last_sign_in_at', 'is', null)

    const score = Math.min(100, Math.round(((loginCount ?? 0) / 5) * 100))
    await supabase.from('schools').update({ trial_active_score: score }).eq('id', schoolId)
  }

  return NextResponse.json({ ok: true, updated, school: { ...school } })
}
