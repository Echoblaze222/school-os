'use client'
// src/app/dashboard/student/quizzes/QuizListClient.tsx

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import styles from './quizzes.module.css'
import type { QuizSummary } from './types'

interface Props {
  quizzes: QuizSummary[]
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return 'Ended'
  const totalSeconds = Math.floor(ms / 1000)
  const hours   = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`
  return `${seconds}s`
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  })
}

function LiveCountdown({ endsAt }: { endsAt: string }) {
  const [ms, setMs] = useState(() => new Date(endsAt).getTime() - Date.now())

  useEffect(() => {
    const id = setInterval(() => {
      setMs(new Date(endsAt).getTime() - Date.now())
    }, 1000)
    return () => clearInterval(id)
  }, [endsAt])

  return (
    <span className={ms < 60000 ? styles.countdownUrgent : styles.countdown}>
      ⏱ {formatCountdown(ms)} left
    </span>
  )
}

function StartsInCountdown({ startsAt }: { startsAt: string }) {
  const [ms, setMs] = useState(() => new Date(startsAt).getTime() - Date.now())

  useEffect(() => {
    if (ms <= 0) return
    const id = setInterval(() => {
      setMs(new Date(startsAt).getTime() - Date.now())
    }, 1000)
    return () => clearInterval(id)
  }, [startsAt, ms])

  if (ms <= 0) return null
  return (
    <span className={styles.startsIn}>
      Starts in {formatCountdown(ms)}
    </span>
  )
}

export default function QuizListClient({ quizzes }: Props) {
  const router = useRouter()
  const [theme, setTheme] = useState<'light' | 'dark'>('light')
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')

  useEffect(() => {
    const t = localStorage.getItem('schoolos_theme')
    if (t === 'dark' || t === 'light') {
      setTheme(t)
      document.documentElement.setAttribute('data-theme', t)
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light'
    setTheme(next)
    localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next)
  }

  const upcoming = quizzes.filter(q => q.status !== 'ended')
  const past     = quizzes.filter(q => q.status === 'ended')
  const list     = tab === 'upcoming' ? upcoming : past

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={() => router.push('/dashboard/student')}
          aria-label="Back to dashboard"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
        </button>
        <h1 className={styles.headerTitle}>Quizzes</h1>
        <button className={styles.themeBtn} onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'upcoming' ? styles.tabActive : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Upcoming & Live
          {upcoming.length > 0 && (
            <span className={styles.tabCount}>{upcoming.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${tab === 'past' ? styles.tabActive : ''}`}
          onClick={() => setTab('past')}
        >
          Past
          {past.length > 0 && (
            <span className={styles.tabCount}>{past.length}</span>
          )}
        </button>
      </div>

      <main className={styles.main}>
        {list.length === 0 ? (
          <div className={styles.empty}>
            <span className={styles.emptyIcon}>📝</span>
            <p className={styles.emptyTitle}>No quizzes here</p>
            <p className={styles.emptySubtitle}>
              {tab === 'upcoming'
                ? 'No upcoming or live quizzes at the moment'
                : 'No completed quizzes yet'}
            </p>
          </div>
        ) : (
          <div className={styles.quizList}>
            {list.map(quiz => (
              <div key={quiz.id} className={styles.quizCard}>
                <div className={styles.quizCardTop}>
                  <span className={styles.subjectPill}>{quiz.subject_name}</span>
                  <div className={styles.badges}>
                    {quiz.status === 'live' && (
                      <span className={styles.liveBadge}>
                        <span className={styles.liveDot} />
                        LIVE
                      </span>
                    )}
                    {quiz.status === 'upcoming' && (
                      <span className={styles.upcomingBadge}>Upcoming</span>
                    )}
                    {quiz.status === 'ended' && quiz.attempted && (
                      <span className={styles.attemptedBadge}>Attempted ✓</span>
                    )}
                    {quiz.status === 'ended' && !quiz.attempted && (
                      <span className={styles.missedBadge}>Missed</span>
                    )}
                  </div>
                </div>

                <p className={styles.quizTitle}>{quiz.title}</p>
                {quiz.description && (
                  <p className={styles.quizDesc}>{quiz.description}</p>
                )}

                <div className={styles.quizMeta}>
                  <span className={styles.metaItem}>
                    🕐 {formatDateTime(quiz.starts_at)}
                  </span>
                  <span className={styles.metaItem}>
                    🏆 {quiz.total_marks} pts
                  </span>
                </div>

                {quiz.status === 'live' && (
                  <LiveCountdown endsAt={quiz.ends_at} />
                )}
                {quiz.status === 'upcoming' && (
                  <StartsInCountdown startsAt={quiz.starts_at} />
                )}

                {quiz.attempted && quiz.prior_score !== null && (
                  <div className={styles.priorScore}>
                    Your score: <strong>{quiz.prior_score}/{quiz.prior_total}</strong>
                    {' '}
                    <span className={styles.priorPct}>
                      ({Math.round((quiz.prior_score / (quiz.prior_total ?? 100)) * 100)}%)
                    </span>
                  </div>
                )}

                {quiz.status === 'live' && !quiz.attempted && (
                  <button
                    className={styles.startBtn}
                    onClick={() => router.push(`/dashboard/student/quizzes/${quiz.id}`)}
                  >
                    Start Quiz →
                  </button>
                )}

                {quiz.status === 'live' && quiz.attempted && (
                  <div className={styles.alreadyDone}>
                    ✓ Already submitted
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      <nav className={styles.bottomNav}>
        <button className={styles.navItem} onClick={() => router.push('/dashboard/student')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
          <span>Home</span>
        </button>
        <button className={`${styles.navItem} ${styles.navItemActive}`} onClick={() => router.push('/dashboard/student/quizzes')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
            <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
          </svg>
          <span>Quizzes</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/dashboard/student/leaderboard')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
            <polyline points="17 6 23 6 23 12"/>
          </svg>
          <span>Ranks</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/dashboard/student/notes')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
          </svg>
          <span>Notes</span>
        </button>
        <button className={styles.navItem} onClick={() => router.push('/dashboard/student/profile')}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
            <circle cx="12" cy="7" r="4"/>
          </svg>
          <span>Profile</span>
        </button>
      </nav>
    </div>
  )
}
