// src/app/register-school/layout.tsx
// This is a NESTED layout under the real root layout (src/app/layout.tsx),
// which already owns <html>/<head>/<body>, PWA metadata, icons, and the
// service worker registration. A nested layout must never render those tags
// itself. Next.js only permits <html>/<body> in the true root layout.
// The previous version rendered a full second <html> here, which is invalid
// and will fail at build/runtime.
//
// This route still gets its own scoped design tokens (register-school
// globals.css, imported below). Next.js App Router loads/unloads
// route-scoped CSS as you navigate in and out of this subtree, so this
// override doesn't leak into the rest of the app.
//
// data-surface="premium" puts every page in this subtree (the wizard, success,
// pending, failed) on the premium black / premium white surface defined in
// src/app/premium-surface.css, and the switch in the corner lets the visitor
// change between the two.
import type { Metadata } from 'next'
import { ThemeScript } from './ThemeScript'
import ThemeToggleFab from '@/components/public/ThemeToggleFab'
import './globals.css'

export const metadata: Metadata = {
  title: 'Register Your School | SchoolOS',
  description: 'Set up your school on SchoolOS',
}

export default function RegisterSchoolLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      {/* Prevent theme flash for this subtree: runs before hydration */}
      <ThemeScript />
      <div data-surface="premium">
        <ThemeToggleFab />
        {children}
      </div>
    </>
  )
}
