// src/components/auth/TimeoutBanner.tsx
// Shows a banner on the login page when the user was auto-logged out

'use client'

import { useSearchParams } from 'next/navigation'
import styles from './TimeoutBanner.module.css'

export default function TimeoutBanner() {
  const params = useSearchParams()
  const reason = params.get('reason')

  if (reason !== 'timeout') return null

  return (
    <div className={styles.banner}>
      <span>🔒</span>
      <span>You were logged out due to inactivity. Please sign in again.</span>
    </div>
  )
}
