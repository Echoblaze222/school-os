'use client'
// src/components/legal/LegalBackLink.tsx
// Small client-side "Back" control for the legal pages. Goes back in history
// when there is somewhere to go back to, otherwise to the home page, so a
// visitor who opened the link directly is never stranded.

import { useRouter } from 'next/navigation'
import styles from './legal.module.css'

export default function LegalBackLink() {
  const router = useRouter()
  return (
    <button
      type="button"
      className={styles.back}
      onClick={() => {
        if (typeof window !== 'undefined' && window.history.length > 1) router.back()
        else router.push('/')
      }}
    >
      ← Back
    </button>
  )
}
