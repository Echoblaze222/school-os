// src/app/join/page.tsx
// Public platform (Phase 4, Lane C) - §58 self-service SchoolOS identity.
// Server wrapper only: useSearchParams() lives in JoinClient, which must be
// wrapped in Suspense or Next.js fails static export with:
// "useSearchParams() should be wrapped in a suspense boundary at page /join"

import { Suspense } from 'react'
import JoinClient from './JoinClient'

export default function JoinPage() {
  return (
    <Suspense fallback={null}>
      <JoinClient />
    </Suspense>
  )
}
