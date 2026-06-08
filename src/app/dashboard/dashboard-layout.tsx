'use client'
// src/app/dashboard/layout.tsx  (or wherever your dashboard lives)
// Wraps all authenticated pages with the auto-logout system.
// Shows a warning toast 5 minutes before logout.

import { useState, useCallback } from 'react'
import { useAutoLogout } from '@/lib/useAutoLogout'
import styles from './dashboard-layout.module.css'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [showWarning, setShowWarning] = useState(false)

  const handleWarning = useCallback(() => {
    setShowWarning(true)
    // Auto-hide warning after 30 seconds (user can dismiss it)
    setTimeout(() => setShowWarning(false), 30_000)
  }, [])

  const handleLogout = useCallback(() => {
    setShowWarning(false)
  }, [])

  useAutoLogout({
    onWarning: handleWarning,
    onLogout: handleLogout,
  })

  return (
    <>
      {children}

      {/* ── Inactivity Warning Toast ── */}
      {showWarning && (
        <div className={styles.warningToast}>
          <span className={styles.warningIcon}>⏰</span>
          <div className={styles.warningText}>
            <p className={styles.warningTitle}>Inactivity Warning</p>
            <p className={styles.warningMsg}>You'll be logged out in 5 minutes due to inactivity.</p>
          </div>
          <button
            className={styles.warningDismiss}
            onClick={() => setShowWarning(false)}
          >
            Stay Logged In
          </button>
        </div>
      )}
    </>
  )
}
