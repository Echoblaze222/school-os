'use client'
// components/AllFeaturesSheet.tsx
// A single "All features" button that opens a bottom sheet listing every
// module for the current role, grouped. Replaces a permanently-visible
// grid/sidebar of every button at once — the role's routes don't change,
// only how many of them are on screen by default.

import Link from 'next/link'
import { useState } from 'react'
import { GridIcon, XIcon } from './Icons'
import { ripple } from '@/lib/ripple'
import motion from './dashboard-motion.module.css'
import styles from './AllFeaturesSheet.module.css'

export interface FeatureItem {
  id:    string
  label: string
  href:  string
  Icon:  React.ComponentType<{ size?: number; color?: string }>
}
export interface FeatureGroup {
  name:  string
  items: FeatureItem[]
}

interface Props {
  groups: FeatureGroup[]
  role:   string
}

export default function AllFeaturesSheet({ groups, role }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        className={`${styles.trigger} ${motion.rippleHost} ${motion.focusable}`}
        onClick={() => setOpen(true)}
        onMouseDown={ripple(motion)}
        aria-label="All features"
      >
        <GridIcon size={15} />
        All features
      </button>

      {open && (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}>
          <div className={styles.sheet}>
            <div className={styles.head}>
              <h3>All features</h3>
              <button className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
                <XIcon size={15} />
              </button>
            </div>

            <div className={styles.note}>
              Showing {role.charAt(0).toUpperCase() + role.slice(1)} features only. This account can't open any other role's dashboard.
            </div>

            {groups.map(g => (
              <div key={g.name} className={styles.group}>
                <h4>{g.name}</h4>
                <div className={styles.grid}>
                  {g.items.map(item => (
                    <Link key={item.id} href={item.href} className={styles.feat} onClick={() => setOpen(false)}>
                      <item.Icon size={20} />
                      <span>{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
