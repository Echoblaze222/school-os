'use client'
// src/components/settings/AutoLockSettings.tsx
// Drop this into any role's Settings page. Reads/writes the signed-in
// user's own profiles.auto_lock_enabled / auto_lock_minutes directly
// (RLS already allows a user to update their own profile row - see
// profiles_update_merged) - no dedicated API route needed.

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { LockIcon, CheckIcon } from '@/components/Icons'
import styles from './AutoLockSettings.module.css'

const DURATIONS = [5, 10, 15, 20, 30, 45, 60]

export default function AutoLockSettings({ userId }: { userId: string }) {
  const [enabled,  setEnabled]  = useState(true)
  const [minutes,  setMinutes]  = useState(10)
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(false)
  const [saved,    setSaved]    = useState(false)
  const supabase = createClient()

  useEffect(() => {
    supabase.from('profiles').select('auto_lock_enabled, auto_lock_minutes').eq('id', userId).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setEnabled(data.auto_lock_enabled ?? true)
          setMinutes(data.auto_lock_minutes ?? 10)
        }
        setLoading(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function save(next: { enabled: boolean; minutes: number }) {
    setSaving(true)
    const { error } = await supabase.from('profiles')
      .update({ auto_lock_enabled: next.enabled, auto_lock_minutes: next.minutes })
      .eq('id', userId)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  function toggle() {
    const next = !enabled
    setEnabled(next)
    save({ enabled: next, minutes })
  }

  function changeMinutes(m: number) {
    setMinutes(m)
    save({ enabled, minutes: m })
  }

  if (loading) return null

  return (
    <div className={`glass-card ${styles.card}`}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <LockIcon size={18} />
          <div>
            <p className={styles.title}>Auto-lock</p>
            <p className={styles.sub}>Require your password after you&apos;ve been inactive. You stay signed in - notifications still come through.</p>
          </div>
        </div>
        <button
          className={`${styles.toggle} ${enabled ? styles.toggleOn : ''}`}
          onClick={toggle}
          disabled={saving}
          aria-label="Toggle auto-lock"
        >
          <span className={styles.toggleKnob} />
        </button>
      </div>

      {enabled && (
        <div className={styles.durationRow}>
          <p className={styles.durationLabel}>Lock after</p>
          <div className={styles.durationOptions}>
            {DURATIONS.map(m => (
              <button
                key={m}
                className={`${styles.durationBtn} ${minutes === m ? styles.durationBtnActive : ''}`}
                onClick={() => changeMinutes(m)}
                disabled={saving}
              >
                {m}m
              </button>
            ))}
          </div>
        </div>
      )}

      {saved && <p className={styles.savedNote}><CheckIcon size={12} /> Saved</p>}
    </div>
  )
}
