// src/app/service-unavailable/layout.tsx
// Server layout so the holding page (a client component) can carry metadata:
// it must never be indexed.
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Service unavailable | SchoolOS',
  robots: { index: false, follow: false },
}

export default function ServiceUnavailableLayout({ children }: { children: React.ReactNode }) {
  return children
}
