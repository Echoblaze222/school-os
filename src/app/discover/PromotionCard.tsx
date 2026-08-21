'use client'
// src/app/discover/PromotionCard.tsx
// Fires anonymous impression/view events via /api/public/promotions/[id]/track.
// session_ref is a random per-mount token used only to de-duplicate this
// card's own repeat impressions client-side - never sent anywhere else,
// never read back, not derived from anything identifying.
import { useEffect, useRef } from 'react'
import styles from './public.module.css'
import { isSafeHttpUrl } from '@/lib/validation/safeUrl'

const TYPE_LABELS: Record<string, string> = {
  admission: 'Admission', open_day: 'Open Day', scholarship: 'Scholarship',
  event: 'Event', academic_program: 'Academic Program', achievement: 'Achievement',
  announcement: 'Announcement', campaign: 'Campaign', article: 'Article',
  facility: 'Facility', boarding: 'Boarding', application_deadline: 'Application Deadline',
}

function track(id: string, eventType: string, sessionRef: string) {
  fetch(`/api/public/promotions/${id}/track`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event_type: eventType, session_ref: sessionRef }),
    keepalive: true,
  }).catch(() => { /* best-effort analytics, never block the UI on it */ })
}

export default function PromotionCard({ promotion }: { promotion: any }) {
  const sessionRef = useRef(Math.random().toString(36).slice(2))
  const tracked = useRef(false)

  useEffect(() => {
    if (tracked.current) return
    tracked.current = true
    track(promotion.id, 'impression', sessionRef.current)
  }, [promotion.id])

  const handleClick = () => track(promotion.id, 'view', sessionRef.current)

  const school = promotion.schools
  const content = (
    <>
      <div className={styles.cardTop}>
        <span className={styles.typeTag}>{TYPE_LABELS[promotion.promotion_type] ?? promotion.promotion_type}</span>
        {promotion.is_sponsored && <span className={styles.sponsoredTag}>Sponsored</span>}
      </div>
      {school && (
        <span className={styles.cardSchool}>{school.name}{school.city ? ` · ${school.city}` : ''}</span>
      )}
      <h3 className={styles.cardTitle}>{promotion.title}</h3>
      <p className={styles.cardSummary}>{promotion.summary}</p>
    </>
  )

  if (promotion.external_link && isSafeHttpUrl(promotion.external_link)) {
    return (
      <a
        href={promotion.external_link}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.card}
        onClick={handleClick}
      >
        {content}
      </a>
    )
  }

  return <div className={styles.card}>{content}</div>
}
