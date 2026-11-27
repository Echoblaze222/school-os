'use client'
// components/GlassMenuButton.tsx
// Three-line menu button for the dashboard headers. Opens the same glass
// sidebar drawer as the bottom dock Menu button, sliding in from the right
// (the side the button sits on).

import { useState } from 'react'
import type { FeatureGroup } from './AllFeaturesSheet'
import MobileGlassNav from './MobileGlassNav'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'

interface Props {
  role:      string
  groups:    FeatureGroup[]
  aiHref:    string
  homeHref?: string
  profile?:  any
  school?:   any
  className: string
}

export default function GlassMenuButton({ role, groups, aiHref, homeHref, profile, school, className }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        className={`${className} ${motion.rippleHost} ${motion.focusable}`}
        onClick={() => setOpen(true)}
        onMouseDown={ripple(motion)}
        aria-label="Open menu"
        aria-haspopup="dialog"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      </button>

      {open && (
        <MobileGlassNav
          role={role}
          groups={groups}
          aiHref={aiHref}
          homeHref={homeHref}
          profile={profile}
          school={school}
          origin="right"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
