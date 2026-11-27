'use client'
// src/components/settings/NotificationPreferencesSettings.tsx
// Drop this into any role's Settings page, next to <AutoLockSettings/>.
//
// Closes two gaps found during a notification-system audit:
//
//   1. PushToggle.tsx (the device push on/off control) was a fully
//      working component that was never mounted anywhere reachable in
//      the app - its own top-of-file comment says so directly. This
//      finally gives it the "real home" that comment asked for.
//   2. notification_preferences (the per-category WhatsApp/SMS table
//      Lane 3 built - docs/lane3-notifications) had zero UI anywhere
//      across any role's settings page to actually set a preference,
//      even though notifyUser() already reads and enforces it. This is
//      that missing UI.
//
// Push notifications are now this app's primary notification channel
// (see the push_subscriptions check added to notifyUser.ts); WhatsApp/
// SMS via Termii is a paid backup for someone who can't receive push,
// not a second copy of every notification. The category toggles below
// reflect that framing: they only control the backup channel, not
// whether an in-app/push notification happens at all (that part isn't
// optional, and isn't shown here as if it were).

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { BellIcon, CheckIcon } from '@/components/Icons'
import PushToggle from '@/components/PushToggle'
import styles from './NotificationPreferencesSettings.module.css'

// Every category actually in use across notifyUser() call sites today
// (fee_reminder - bursar reminders; counseling_referral - counselor
// referrals) plus the broadcast/system set used by
// /api/notifications/send (matches NotificationsPageShared.tsx's own
// NOTIF_TYPES list). Not an invented list - matches what this app
// actually sends. Categories in MANDATORY_CATEGORIES (notifyUser.ts)
// are deliberately left out here since preferences can't turn them off
// - showing a toggle a user could flip with no effect would be worse
// than not showing it.
const CATEGORIES: { key: string; label: string }[] = [
  { key: 'fee_reminder',        label: 'Fee reminders' },
  { key: 'attendance',          label: 'Attendance alerts' },
  { key: 'result',              label: 'Results' },
  { key: 'assignment',          label: 'Assignments' },
  { key: 'payment',             label: 'Payment confirmations' },
  { key: 'announcement',        label: 'School announcements' },
  { key: 'meeting',             label: 'Meetings' },
  { key: 'reminder',            label: 'General reminders' },
  { key: 'counseling_referral', label: 'Counseling referrals' },
  { key: 'system',              label: 'System notices' },
]

interface PrefRow {
  category: string
  whatsapp_enabled: boolean
  sms_enabled: boolean
}

type ChannelPrefs = { whatsapp: boolean; sms: boolean }

export default function NotificationPreferencesSettings({ userId }: { userId: string }) {
  const [profileDefaults, setProfileDefaults] = useState<ChannelPrefs>({ whatsapp: true, sms: true })
  const [prefs,   setPrefs]   = useState<Record<string, ChannelPrefs>>({})
  const [loading, setLoading] = useState(true)
  const [saving,  setSaving]  = useState<string | null>(null) // category key currently saving
  const [saved,   setSaved]   = useState(false)
  const supabase = createClient()

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('notify_whatsapp, notify_sms').eq('id', userId).maybeSingle(),
      supabase.from('notification_preferences').select('category, whatsapp_enabled, sms_enabled').eq('user_id', userId),
    ]).then(([{ data: profile }, { data: rows }]) => {
      setProfileDefaults({
        whatsapp: profile?.notify_whatsapp ?? true,
        sms:      profile?.notify_sms ?? true,
      })
      const byCategory: Record<string, ChannelPrefs> = {}
      for (const row of (rows ?? []) as PrefRow[]) {
        byCategory[row.category] = { whatsapp: row.whatsapp_enabled, sms: row.sms_enabled }
      }
      setPrefs(byCategory)
      setLoading(false)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Mirrors notifyUser.ts's own fallback: a category with no saved row
  // yet shows the account-level default, not a hardcoded "on".
  function valueFor(category: string, channel: keyof ChannelPrefs): boolean {
    return prefs[category]?.[channel] ?? profileDefaults[channel]
  }

  async function toggle(category: string, channel: keyof ChannelPrefs) {
    const previous: ChannelPrefs = { whatsapp: valueFor(category, 'whatsapp'), sms: valueFor(category, 'sms') }
    const next: ChannelPrefs = { ...previous, [channel]: !previous[channel] }

    setPrefs(prev => ({ ...prev, [category]: next }))
    setSaving(category)

    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: userId,
          category,
          whatsapp_enabled: next.whatsapp,
          sms_enabled: next.sms,
          // push_enabled/in_app_enabled aren't exposed here - see the
          // schema's own comment ("almost never turned off... not for
          // enforcing"). Keep them at the table default rather than
          // silently writing an opinion this UI never asked the user for.
          push_enabled: true,
          in_app_enabled: true,
        },
        { onConflict: 'user_id,category' },
      )

    setSaving(null)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      setPrefs(prev => ({ ...prev, [category]: previous }))
    }
  }

  if (loading) return null

  return (
    <div className={`glass-card ${styles.card}`}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <BellIcon size={18} />
          <div>
            <p className={styles.title}>Notifications</p>
            <p className={styles.sub}>
              Push notifications on this device are how SchoolOS reaches you first.
              WhatsApp/SMS below is only a backup for when you can&apos;t receive push.
            </p>
          </div>
        </div>
      </div>

      <div className={styles.pushRow}>
        <PushToggle />
      </div>

      <div className={styles.categoryList}>
        <p className={styles.sectionLabel}>Backup SMS / WhatsApp, by category</p>
        {CATEGORIES.map(({ key, label }) => (
          <div key={key} className={styles.categoryRow}>
            <span className={styles.categoryLabel}>{label}</span>
            <div className={styles.categoryToggles}>
              <button
                className={`${styles.chip} ${valueFor(key, 'whatsapp') ? styles.chipOn : ''}`}
                onClick={() => toggle(key, 'whatsapp')}
                disabled={saving === key}
              >
                WhatsApp
              </button>
              <button
                className={`${styles.chip} ${valueFor(key, 'sms') ? styles.chipOn : ''}`}
                onClick={() => toggle(key, 'sms')}
                disabled={saving === key}
              >
                SMS
              </button>
            </div>
          </div>
        ))}
      </div>

      {saved && <p className={styles.savedNote}><CheckIcon size={12} /> Saved</p>}
    </div>
  )
}
