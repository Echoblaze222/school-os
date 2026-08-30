// src/app/verify/certificate/[token]/page.tsx
// -------------------------------------------------------
// Public verification page (§42). Renders server-side so the result is
// visible even to a plain HTTP client scanning the QR without JS, and
// so the verification event gets logged even on first paint.
// -------------------------------------------------------

import { headers } from 'next/headers'
import VerifyClient from './VerifyClient'

async function fetchVerification(token: string) {
  const h = await headers()
  const proto = h.get('x-forwarded-proto') ?? 'https'
  const host  = h.get('host')
  try {
    const res = await fetch(`${proto}://${host}/api/certificates/verify/${encodeURIComponent(token)}`, { cache: 'no-store' })
    return await res.json()
  } catch {
    return { ok: false, status: 'error' }
  }
}

export default async function VerifyCertificatePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await fetchVerification(token)
  return <VerifyClient data={data} />
}
