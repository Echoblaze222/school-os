'use client'
// src/components/public/SecretHqLink.tsx
// Tap the copyright line 5 times within 2.5 seconds to jump straight to
// the unlisted /super-admin/hq dashboard - a faster path than typing the
// URL. This is NOT the security boundary: /super-admin/hq is already
// gated server-side on platform_admins.is_super, so anyone else who
// stumbles onto this just lands on the ordinary login screen and then a
// 404. This only saves Speed some typing.

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
      router.push('/super-admin/hq')
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
