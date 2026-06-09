'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import styles from './TrialBanner.module.css'

interface Props {
  trialEndsAt:   string        // ISO date string
  schoolId:      string
  setupStatus:   string
  schoolColor?:  string
}

export default function TrialBanner({ trialEndsAt, schoolId, setupStatus, schoolColor = '#7C3AED' }: Props) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, mins: 0, secs: 0 })
  const [urgency,  setUrgency]  = useState<'info' | 'warning' | 'critical'>('info')
  const [show,     setShow]     = useState(true)

  useEffect(() => {
    function tick() {
      const now  = Date.now()
      const end  = new Date(trialEndsAt).getTime()
      const diff = Math.max(0, end - now)

      const days  = Math.floor(diff / 86400000)
      const hours = Math.floor((diff % 86400000) / 3600000)
      const mins  = Math.floor((diff % 3600000)  / 60000)
      const secs  = Math.floor((diff % 60000)    / 1000)

      setTimeLeft({ days, hours, mins, secs })

      if (days <= 1)  setUrgency('critical')
      else if (days <= 3) setUrgency('warning')
      else setUrgency('info')
    }

    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [trialEndsAt])

  if (!show || setupStatus !== 'trial') return null

  const isExpired = timeLeft.days === 0 && timeLeft.hours === 0 && timeLeft.mins === 0 && timeLeft.secs === 0

  return (
    <div className={`${styles.banner} ${styles[urgency]}`}>
      <div className={styles.inner}>
        <div className={styles.left}>
          {urgency === 'critical'
            ? <span className={styles.fireEmoji}>🔥</span>
            : urgency === 'warning'
              ? <span className={styles.warningEmoji}>⚠️</span>
              : <span className={styles.infoEmoji}>🎉</span>
          }
          <div>
            <p className={styles.title}>
              {isExpired
                ? 'Your free trial has expired'
                : urgency === 'critical'
                  ? 'Final hours of your free trial!'
                  : urgency === 'warning'
                    ? 'Your free trial is ending soon'
                    : 'You are on a free 10-day trial'
              }
            </p>
            <p className={styles.sub}>
              {isExpired
                ? 'Pay for setup to restore full access and start your free month.'
                : 'Pay for setup within your trial to unlock permanent access + 1 month free.'
              }
            </p>
          </div>
        </div>

        {!isExpired && (
          <div className={styles.countdown}>
            <div className={styles.countUnit}>
              <span className={styles.countNum}>{String(timeLeft.days).padStart(2,'0')}</span>
              <span className={styles.countLabel}>days</span>
            </div>
            <span className={styles.colon}>:</span>
            <div className={styles.countUnit}>
              <span className={styles.countNum}>{String(timeLeft.hours).padStart(2,'0')}</span>
              <span className={styles.countLabel}>hrs</span>
            </div>
            <span className={styles.colon}>:</span>
            <div className={styles.countUnit}>
              <span className={styles.countNum}>{String(timeLeft.mins).padStart(2,'0')}</span>
              <span className={styles.countLabel}>min</span>
            </div>
            <span className={styles.colon}>:</span>
            <div className={styles.countUnit}>
              <span className={styles.countNum}>{String(timeLeft.secs).padStart(2,'0')}</span>
              <span className={styles.countLabel}>sec</span>
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <a
            href="https://wa.me/2347063523130?text=I%20want%20to%20pay%20for%20SchoolOS%20setup"
            target="_blank"
            rel="noreferrer"
            className={styles.payBtn}
          >
            Pay for Setup
          </a>
          {!isExpired && (
            <button className={styles.closeBtn} onClick={() => setShow(false)}>✕</button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {!isExpired && (
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{
              width: `${100 - ((timeLeft.days * 86400 + timeLeft.hours * 3600 + timeLeft.mins * 60 + timeLeft.secs) / (10 * 86400)) * 100}%`,
            }}
          />
        </div>
      )}
    </div>
  )
}
