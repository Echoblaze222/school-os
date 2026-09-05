// src/app/api/cron/ict-asset-checks/route.ts
// Vercel Cron Job, same pattern as check-subscriptions/reminders.
// Configure in vercel.json:
// { "path": "/api/cron/ict-asset-checks", "schedule": "0 6 * * *" }  (daily, 06:00)
//
// Closes the one §27 ICT notification type nothing else in this lane
// triggers: "device maintenance". Two real, checkable conditions:
// deliberately not a vague "check on your devices" ping:
//   1. An asset borrowed (ict_asset_events, event_type='borrowed') with a
//      due_back_at in the past and no later 'returned' event, overdue.
//   2. An asset whose warranty_expires_at falls within the next 30 days.
// Both are idempotent per day via a dedupe key in portal_audit_log, so a
// re-run (retry, manual trigger) doesn't spam the same alert twice.

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyAppointmentHolders } from '@/lib/notify'

export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()
  const today = new Date().toISOString().slice(0, 10) // dedupe key granularity: once per day
  const now = new Date()
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const { data: schools, error: schoolsErr } = await admin.from('schools').select('id')
  if (schoolsErr) {
    console.error('[cron/ict-asset-checks] schools fetch error:', schoolsErr.message)
    return NextResponse.json({ error: schoolsErr.message }, { status: 500 })
  }

  let overdueNotified = 0
  let warrantyNotified = 0

  for (const school of schools ?? []) {
    // ── Overdue borrowed assets ──────────────────────────────────────────
    const { data: borrowEvents } = await admin
      .from('ict_asset_events')
      .select('id, asset_id, due_back_at, ict_assets(asset_tag, name)')
      .eq('school_id', school.id)
      .eq('event_type', 'borrowed')
      .lt('due_back_at', now.toISOString())

    const overdueEvents = borrowEvents ?? []

    if (overdueEvents.length > 0) {
      const assetIds = [...new Set(overdueEvents.map((e: any) => e.asset_id))]

      // PERF: was one query per overdue event to check for a later
      // 'returned' event (N round trips for N events, times every
      // school every day). Batched into a single query across every
      // asset for this school, then the precise per-event
      // "returned after THIS event's own due_back_at" check happens in
      // JS - same comparison the original did, just not one row at a
      // time. earliestDue is a loose pre-filter; the real check below
      // is still per-event.
      const earliestDue = overdueEvents.reduce(
        (min: string, e: any) => (e.due_back_at < min ? e.due_back_at : min),
        overdueEvents[0].due_back_at,
      )
      const { data: returnedEvents } = await admin
        .from('ict_asset_events')
        .select('asset_id, created_at')
        .in('asset_id', assetIds)
        .eq('event_type', 'returned')
        .gt('created_at', earliestDue)
      const returnedByAsset = new Map<string, string[]>()
      for (const r of returnedEvents ?? []) {
        const list = returnedByAsset.get(r.asset_id) ?? []
        list.push(r.created_at)
        returnedByAsset.set(r.asset_id, list)
      }

      // PERF: same batching for the dedupe check - one query per asset
      // before, now one query per school. Fetches every alert logged
      // for these assets today and matches the exact dedupe_key string
      // in JS, so this is behaviorally identical to the old per-row
      // .eq('metadata->>dedupe_key', ...) check, not an approximation.
      const { data: existingOverdueAlerts } = await admin
        .from('portal_audit_log')
        .select('metadata')
        .eq('action', 'ict_device_maintenance_alert')
        .in('target_id', assetIds)
        .gte('logged_at', `${today}T00:00:00.000Z`)
      const alreadyAlertedOverdue = new Set(
        (existingOverdueAlerts ?? []).map((r: any) => r.metadata?.dedupe_key).filter(Boolean),
      )

      for (const ev of overdueEvents) {
        const returns = returnedByAsset.get(ev.asset_id) ?? []
        if (returns.some((createdAt) => createdAt > ev.due_back_at)) continue // already returned since being due

        const dedupeKey = `ict_overdue_asset:${ev.asset_id}:${today}`
        if (alreadyAlertedOverdue.has(dedupeKey)) continue

        const asset = (ev as any).ict_assets
        await notifyAppointmentHolders(admin, school.id, ['ict_officer', 'ict_administrator'], {
          title: 'Overdue device return',
          body:  `${asset?.name ?? 'A device'} (${asset?.asset_tag ?? ''}) is overdue for return.`,
          type:  'ict_device_maintenance',
          action_url: '/dashboard/ict/assets',
        })
        try {
          await admin.from('portal_audit_log').insert({
            action: 'ict_device_maintenance_alert', actor_id: null, target_table: 'ict_assets',
            target_id: ev.asset_id, metadata: { dedupe_key: dedupeKey, reason: 'overdue_return' },
            logged_at: new Date().toISOString(),
          })
        } catch {
          // Non-critical, same as every other portal_audit_log write in this
          // codebase, but here it also means dedupe degrades (this alert may
          // re-fire tomorrow) rather than the whole cron run failing. Worth
          // confirming actor_id accepts NULL in the live schema (unverifiable
          // from this repo, see Phase 1's "no migration history" note).
        }
        overdueNotified++
      }
    }

    // ── Warranty expiring within 30 days ─────────────────────────────────
    const { data: expiringAssets } = await admin
      .from('ict_assets')
      .select('id, asset_tag, name, warranty_expires_at')
      .eq('school_id', school.id)
      .not('warranty_expires_at', 'is', null)
      .lte('warranty_expires_at', in30Days)
      .gte('warranty_expires_at', now.toISOString().slice(0, 10))
      .neq('status', 'retired')

    const expiring = expiringAssets ?? []

    if (expiring.length > 0) {
      const assetIds = expiring.map((a: any) => a.id)

      // Same dedupe batching as the overdue branch above.
      const { data: existingWarrantyAlerts } = await admin
        .from('portal_audit_log')
        .select('metadata')
        .eq('action', 'ict_device_maintenance_alert')
        .in('target_id', assetIds)
        .gte('logged_at', `${today}T00:00:00.000Z`)
      const alreadyAlertedWarranty = new Set(
        (existingWarrantyAlerts ?? []).map((r: any) => r.metadata?.dedupe_key).filter(Boolean),
      )

      for (const asset of expiring) {
        const dedupeKey = `ict_warranty:${asset.id}:${today}`
        if (alreadyAlertedWarranty.has(dedupeKey)) continue

        await notifyAppointmentHolders(admin, school.id, ['ict_officer', 'ict_administrator'], {
          title: 'Warranty expiring soon',
          body:  `${asset.name} (${asset.asset_tag}), warranty expires ${asset.warranty_expires_at}.`,
          type:  'ict_device_maintenance',
          action_url: '/dashboard/ict/assets',
        })
        try {
          await admin.from('portal_audit_log').insert({
            action: 'ict_device_maintenance_alert', actor_id: null, target_table: 'ict_assets',
            target_id: asset.id, metadata: { dedupe_key: dedupeKey, reason: 'warranty_expiring' },
            logged_at: new Date().toISOString(),
          })
        } catch { /* see overdue-branch comment above */ }
        warrantyNotified++
      }
    }
  }

  return NextResponse.json({ success: true, overdueNotified, warrantyNotified })
}
