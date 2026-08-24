// src/app/join/page.tsx
// Public platform (Phase 4, Lane C) - §58 self-service SchoolOS identity.
//
// This file is deliberately just a wrapper, not a page component itself.
// The actual form lives in JoinClient.tsx, which calls useSearchParams()
// to read ?next= - that hook opts the whole route out of static
// prerendering unless something above it in the tree suspends. Next.js
// needs a Suspense boundary to know what to render for this page during
// the build's static-generation step, before the real query param is
// available at request time. The boundary has to be a parent of the
// component calling the hook, not the same component - that's why this
// can't just be merged back into JoinClient.tsx.
//
// No 'use client' here - this can stay a server component; Suspense
// itself doesn't require client rendering, only JoinClient.tsx (which
// has its own 'use client' directive) does.

import { Suspense } from 'react'
import JoinClient from './JoinClient'
import styles from './join.module.css'

export default function JoinPage() {
  return (
    <Suspense fallback={<div className={styles.page} />}>
      <JoinClient />
    </Suspense>
  )
}
