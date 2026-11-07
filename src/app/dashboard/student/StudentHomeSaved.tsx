'use client'
// src/app/dashboard/student/StudentHomeSaved.tsx
//
// Shown instead of the grey placeholders when the student taps Home and a
// copy of their last-seen home screen is saved on this phone. It paints the
// numbers and recent activity instantly while the real page is on its way.
//
// Deliberately NOT the real dashboard component: that one starts chat, the
// notifications bell and the school switcher, which each make their own
// network calls. On a weak connection we must not start those twice. This
// preview is display-only and makes no network calls at all (the one thing
// it reads is the session the phone already holds, to confirm the saved copy
// belongs to the person using the phone).
//
// It is replaced the moment the real page arrives, and is clearly marked as
// a saved copy so nobody mistakes it for live numbers.

import { useEffect, useState } from 'react'
import BottomDock from '@/components/BottomDock'
import RouteLoading from '@/components/RouteLoading'
import { currentUserId } from '@/lib/savedView/currentUserId'
import { loadView } from '@/lib/savedView/store'
import { STUDENT_FEATURE_GROUPS } from './featureGroups'
import {
  STUDENT_HOME_KEY, SNAPSHOT_VERSION, type StudentHomeSnapshot,
} from './studentHomeSnapshot'
import styles from './student-dashboard.module.css'

const card: React.CSSProperties = {
  padding: '12px 14px', borderRadius: 'var(--radius-lg)', flex: 1,
  display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 2,
}
const label: React.CSSProperties = { margin: 0, fontSize: '0.66rem', color: 'var(--text-muted)' }
const value: React.CSSProperties = { margin: 0, fontSize: '1.05rem', fontWeight: 700, color: 'var(--text-primary)' }

export default function StudentHomeSaved() {
  const [snap, setSnap] = useState<StudentHomeSnapshot | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const uid = await currentUserId()
      if (!uid) return
      const saved = await loadView<StudentHomeSnapshot>(uid, STUDENT_HOME_KEY)
      if (!cancelled && saved && saved.data?.v === SNAPSHOT_VERSION) setSnap(saved.data)
    })()
    return () => { cancelled = true }
  }, [])

  // Nothing saved (first ever visit, expired, different user): plain placeholders.
  if (!snap) return <RouteLoading role="student" groups={STUDENT_FEATURE_GROUPS} />

  const c = snap.counts
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  return (
    <div className={styles.page} aria-busy="true">
      <div
        role="status"
        style={{
          position: 'fixed', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 200,
          padding: '6px 12px', borderRadius: 999, fontSize: '0.72rem', fontWeight: 600,
          background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
          border: '1px solid var(--glass-border)', boxShadow: '0 4px 14px rgba(0,0,0,0.3)',
        }}
      >
        Saved copy · updating…
      </div>

      {/* Not interactive: it is a picture of the last screen, not live data. */}
      <div style={{ pointerEvents: 'none' }}>
        <div
          style={{
            padding: '52px var(--space-5) 28px',
            background: `linear-gradient(135deg, color-mix(in srgb, ${snap.schoolColor} 70%, #000), var(--brand-dark))`,
            color: '#F6F1E4',
          }}
        >
          <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8 }}>{greeting}, {snap.firstName}</p>
          <p style={{ margin: '6px 0 4px', fontSize: '1.2rem', fontWeight: 800 }}>
            {c.gpa != null ? `${c.gpa.toFixed(1)}/5.0 GPA · ${c.attendance ?? 0}% attendance` : 'Your day, at a glance.'}
          </p>
          <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.8 }}>
            {c.rank ? `Rank #${c.rank} in class this term` : snap.schoolName}
          </p>
        </div>

        <main className={styles.main}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12, margin: 'var(--space-6) 0 var(--space-4)' }}>
            <div className="glass-card-flat" style={{ padding: 18, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <p style={{ ...label, fontSize: '0.72rem' }}>Term GPA</p>
              <p style={{ margin: 0, fontSize: '1.6rem', fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1.1 }}>
                {c.gpa != null ? c.gpa.toFixed(1) : 'N/A'}
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-muted)' }}> / 5.0</span>
              </p>
              <div style={{ paddingTop: 10, borderTop: '1px solid var(--glass-border)' }}>
                <p style={label}>Class rank</p>
                <p style={{ ...value, fontSize: '0.95rem' }}>{c.rank ? `#${c.rank}` : 'N/A'}</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="glass-card-flat" style={card}><p style={label}>Attendance</p><p style={value}>{c.attendance ?? 0}%</p></div>
              <div className="glass-card-flat" style={card}><p style={label}>Tasks due</p><p style={value}>{c.pendingTasks}</p></div>
              <div className="glass-card-flat" style={card}><p style={label}>Open quizzes</p><p style={value}>{c.upcomingQuizzes}</p></div>
            </div>
          </div>

          {snap.activities.length > 0 && (
            <div className="glass-card-flat" style={{ padding: 16, borderRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ ...label, fontSize: '0.72rem' }}>Recent activity</p>
              {snap.activities.map((a) => (
                <div key={a.id}>
                  <p style={{ ...value, fontSize: '0.88rem' }}>{a.title}</p>
                  {a.subtitle && <p style={label}>{a.subtitle}</p>}
                </div>
              ))}
            </div>
          )}
          <div className={styles.mobileSpace} />
        </main>
      </div>

      <BottomDock aiHref="/dashboard/student/ai" groups={STUDENT_FEATURE_GROUPS} role="student" />
    </div>
  )
}
