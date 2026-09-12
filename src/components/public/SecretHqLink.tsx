'use client'
// src/components/public/SecretHqLink.tsx
// Tap the copyright line 5 times within 2.5 seconds to jump straight to
// the super-admin login screen - a faster path than typing the URL.
// This is NOT the security boundary: /super-admin/login still requires
// real credentials + PIN, and /super-admin/hq (reachable afterward, e.g.
// by tapping this same trigger again once logged in) is separately gated
// server-side on platform_admins.is_super. This only saves Speed some
// typing.

import { useRef } from 'react'
import { useRouter } from 'next/navigation'

const TAPS_NEEDED = 5
const RESET_MS = 2500

export default function SecretHqLink() {
  const router = useRouter()
  const countRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function handleTap() {
    countRef.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)

    if (countRef.current >= TAPS_NEEDED) {
      countRef.current = 0
      router.push('/super-admin/login')
      return
    }

    timerRef.current = setTimeout(() => { countRef.current = 0 }, RESET_MS)
  }

  return (
    <p onClick={handleTap}>
      © {new Date().getFullYear()} SchoolOS. All rights reserved.
    </p>
  )
}
