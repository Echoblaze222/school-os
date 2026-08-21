// src/components/public/SchoolCard.tsx
// One card, two call sites (landing page "Featured Schools" teaser and the
// /find-schools grid), so the visual language of "a school on SchoolOS"
// stays identical everywhere a visitor encounters it.

import Link from 'next/link'
import { CheckCircleIcon, MapPinIcon, SchoolIcon } from '@/components/Icons'
import type { PublicSchoolListItem } from '@/lib/publicSchools'
import motion from '@/components/dashboard-motion.module.css'
import styles from './SchoolCard.module.css'

export default function SchoolCard({ school, index = 0 }: { school: PublicSchoolListItem; index?: number }) {
  const location = [school.city, school.state].filter(Boolean).join(', ')
  const levels = school.education_levels?.slice(0, 3) ?? []

  return (
    <Link
      href={`/schools/${school.slug}`}
      className={`${styles.card} glass-card ${motion.staggerItem} ${motion.pressable} ${motion.focusable}`}
      style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
    >
      <div
        className={styles.cover}
        style={{
          backgroundImage: school.cover_image_url ? `url(${school.cover_image_url})` : undefined,
          backgroundColor: school.cover_image_url ? undefined : (school.primary_color || 'var(--brand)'),
        }}
      >
        {school.verified_status === 'verified' && (
          <span className={`badge badge-success ${styles.verifiedBadge}`}>
            <CheckCircleIcon size={12} /> Verified
          </span>
        )}
        <div
          className={styles.logo}
          style={{ background: school.logo_url ? 'var(--bg-elevated)' : (school.primary_color || 'var(--brand)') }}
        >
          {school.logo_url
            ? <img src={school.logo_url} alt="" />
            : <SchoolIcon size={20} color="#fff" />
          }
        </div>
      </div>

      <div className={styles.body}>
        <p className={styles.name}>{school.name}</p>
        {location && (
          <p className={styles.location}><MapPinIcon size={12} /> {location}</p>
        )}
        {school.tagline && <p className={styles.tagline}>{school.tagline}</p>}

        <div className={styles.tagRow}>
          <span className="badge badge-muted">
            {school.is_boarding && school.is_day ? 'Boarding & Day' : school.is_boarding ? 'Boarding' : 'Day'}
          </span>
          {levels.map(level => (
            <span key={level} className="badge badge-muted">{level}</span>
          ))}
        </div>
      </div>
    </Link>
  )
}

export function SchoolCardSkeleton() {
  return (
    <div className={`${styles.card} glass-card`} aria-hidden="true">
      <div className={styles.cover} style={{ backgroundColor: 'var(--bg-raised)' }} />
      <div className={styles.body}>
        <div className="skeleton" style={{ width: '70%', height: 15, marginBottom: 8 }} />
        <div className="skeleton" style={{ width: '45%', height: 11, marginBottom: 10 }} />
        <div className="skeleton" style={{ width: '90%', height: 11 }} />
      </div>
    </div>
  )
}
