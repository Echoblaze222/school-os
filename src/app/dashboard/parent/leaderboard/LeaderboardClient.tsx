'use client'
// LeaderboardClient.tsx — works for both 'student' and 'parent' roles
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { TrophyIcon } from '@/components/Icons'
import styles from './page.module.css'

interface LeaderboardEntry {
  student_id: string
  full_name: string
  avatar_url: string | null
  class_level: string
  class_id: string
  quiz_avg: number
  assignment_avg: number
  result_avg: number
  quizzes_taken: number
  assignments_done: number
  results_count: number
  total_score: number
  quiz_contribution: number
  assignment_contribution: number
  result_contribution: number
}

interface Props {
  profile: any
  school: any
  userId: string
  childIds?: string[]   // parent only — pre-fetched from page.tsx
}

export default function LeaderboardClient({ profile, school, userId, childIds = [] }: Props) {
  const [board, setBoard]       = useState<LeaderboardEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const isParent    = profile?.role === 'parent'

  const isHighlighted = (entry: LeaderboardEntry) =>
    isParent ? childIds.includes(entry.student_id) : entry.student_id === userId

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data, error } = await supabase.rpc('get_class_leaderboard', {
      p_school_id: school?.id,
      p_limit: 50,
    })
    if (error) { console.error('Leaderboard error:', error); setLoading(false); return }
    setBoard((data ?? []) as LeaderboardEntry[])
    setLoading(false)
  }

  const medals   = ['🥇', '🥈', '🥉']
  const topThree = board.slice(0, 3)
  const rest     = board.slice(3)
  const pct      = (score: number) => Math.min(100, Math.round((score / 1000) * 100))

  // Entries outside top 3 that should be pinned (student's own / parent's children)
  const pinnedEntries = board
    .map((entry, i) => ({ entry, rank: i + 1 }))
    .filter(({ entry, rank }) => isHighlighted(entry) && rank > 3)

  return (
    <div className={styles.page}>
      {/* StudentNav reads profile.role internally — works for both student and parent */}
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />

      <div className={styles.content}>
        <DashboardHeader
          userId={userId}
          role={isParent ? 'parent' : 'student'}
          profile={profile}
          school={school}
          schoolColor={schoolColor}
          title="Leaderboard"
          showBack
        />

        <main className={styles.main}>
          {loading ? (
            <div className={styles.loading}><span /><span /><span /></div>
          ) : board.length === 0 ? (
            <div className={styles.empty}>
              <TrophyIcon size={40} color="var(--text-faint)" strokeWidth={1} />
              <p>No scores yet — students must complete quizzes, assignments, or exams to appear here.</p>
            </div>
          ) : (
            <>
              {/* ── Pinned rank banners for highlighted entries outside top 3 ── */}
              {pinnedEntries.map(({ entry, rank }) => (
                <div key={entry.student_id} className={styles.myRankBanner} style={{ borderColor: schoolColor }}>
                  <span style={{ color: schoolColor, fontWeight: 800, fontSize: '1.1rem' }}>#{rank}</span>
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem' }}>
                      {entry.full_name}
                      <span style={{ color: schoolColor, fontSize: '0.75rem', marginLeft: 6 }}>
                        {isParent ? 'Your child' : '(You)'}
                      </span>
                    </p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{entry.class_level}</p>
                  </div>
                  <span style={{ fontWeight: 800, color: schoolColor }}>{entry.total_score}pts</span>
                </div>
              ))}

              {/* ── Score legend ── */}
              <div className={styles.legend}>
                <span><span className={styles.dot} style={{ background: '#6366f1' }} />Quiz 40%</span>
                <span><span className={styles.dot} style={{ background: '#f59e0b' }} />Assign. 35%</span>
                <span><span className={styles.dot} style={{ background: '#10b981' }} />Results 25%</span>
              </div>

              {/* ── Top 3 podium ── */}
              {topThree.length > 0 && (
                <div className={styles.podium}>
                  {topThree.map((entry, i) => {
                    const highlighted = isHighlighted(entry)
                    return (
                      <div
                        key={entry.student_id}
                        className={`${styles.podiumCard} ${i === 0 ? styles.podiumFirst : ''}`}
                        style={highlighted ? { borderColor: schoolColor, background: schoolColor + '10' } : {}}
                        onClick={() => setExpanded(expanded === entry.student_id ? null : entry.student_id)}
                      >
                        <div className={styles.podiumMedal}>{medals[i]}</div>

                        <div
                          className={styles.podiumAvatar}
                          style={{ background: schoolColor + '30', color: schoolColor }}
                        >
                          {entry.avatar_url
                            ? <img src={entry.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            : entry.full_name.charAt(0).toUpperCase()}
                        </div>

                        <p className={styles.podiumName}>
                          {entry.full_name.split(' ')[0]}
                          {highlighted && (
                            <span style={{ display: 'block', fontSize: '0.62rem', color: schoolColor, fontWeight: 700 }}>
                              {isParent ? 'Your child' : 'You'}
                            </span>
                          )}
                        </p>
                        <p className={styles.podiumClass}>{entry.class_level}</p>

                        {/* Score ring */}
                        <div className={styles.scoreRing}>
                          <svg viewBox="0 0 36 36" className={styles.ringsvg}>
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--glass-border)" strokeWidth="2.5" />
                            <circle
                              cx="18" cy="18" r="15.9" fill="none"
                              stroke={i === 0 ? 'var(--gold)' : schoolColor}
                              strokeWidth="2.5"
                              strokeDasharray={`${pct(entry.total_score)} ${100 - pct(entry.total_score)}`}
                              strokeDashoffset="25"
                              strokeLinecap="round"
                            />
                          </svg>
                          <span className={styles.ringScore} style={{ color: i === 0 ? 'var(--gold)' : schoolColor }}>
                            {entry.total_score}
                          </span>
                        </div>

                        {/* Breakdown bar */}
                        <div className={styles.breakdownBar}>
                          <div style={{ width: `${(entry.quiz_contribution / 1000) * 100}%`, background: '#6366f1' }} />
                          <div style={{ width: `${(entry.assignment_contribution / 1000) * 100}%`, background: '#f59e0b' }} />
                          <div style={{ width: `${(entry.result_contribution / 1000) * 100}%`, background: '#10b981' }} />
                        </div>

                        {expanded === entry.student_id && (
                          <div className={styles.expandedDetail}>
                            <DetailRow label="Quizzes"     avg={entry.quiz_avg}       count={entry.quizzes_taken}    pts={entry.quiz_contribution}       color="#6366f1" />
                            <DetailRow label="Assignments" avg={entry.assignment_avg} count={entry.assignments_done} pts={entry.assignment_contribution} color="#f59e0b" />
                            <DetailRow label="Results"     avg={entry.result_avg}     count={entry.results_count}    pts={entry.result_contribution}     color="#10b981" />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ── Ranked list (#4 onwards) ── */}
              <div className={styles.list}>
                {rest.map((entry, i) => {
                  const rank        = i + 4
                  const highlighted = isHighlighted(entry)
                  const isOpen      = expanded === entry.student_id
                  return (
                    <div
                      key={entry.student_id}
                      className={styles.card}
                      style={highlighted ? { borderColor: schoolColor, background: schoolColor + '0D' } : {}}
                      onClick={() => setExpanded(isOpen ? null : entry.student_id)}
                    >
                      <div className={styles.rankBadge}>#{rank}</div>

                      <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>
                          {entry.full_name}
                          {highlighted && (
                            <span style={{ color: schoolColor, fontSize: '0.72rem', marginLeft: 6, fontWeight: 700 }}>
                              {isParent ? '· Your child' : '· You'}
                            </span>
                          )}
                        </p>
                        <p className={styles.cardMeta}>{entry.class_level}</p>

                        <div className={styles.miniBar}>
                          <div style={{ width: `${(entry.quiz_contribution / 1000) * 100}%`, background: '#6366f1' }} />
                          <div style={{ width: `${(entry.assignment_contribution / 1000) * 100}%`, background: '#f59e0b' }} />
                          <div style={{ width: `${(entry.result_contribution / 1000) * 100}%`, background: '#10b981' }} />
                        </div>

                        {isOpen && (
                          <div className={styles.expandedDetail}>
                            <DetailRow label="Quizzes"     avg={entry.quiz_avg}       count={entry.quizzes_taken}    pts={entry.quiz_contribution}       color="#6366f1" />
                            <DetailRow label="Assignments" avg={entry.assignment_avg} count={entry.assignments_done} pts={entry.assignment_contribution} color="#f59e0b" />
                            <DetailRow label="Results"     avg={entry.result_avg}     count={entry.results_count}    pts={entry.result_contribution}     color="#10b981" />
                          </div>
                        )}
                      </div>

                      <div className={styles.scoreCol}>
                        <p className={styles.scoreValue} style={highlighted ? { color: schoolColor } : {}}>
                          {entry.total_score}
                        </p>
                        <p className={styles.scorePts}>pts</p>
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className={styles.spacer} />
            </>
          )}
        </main>
      </div>
    </div>
  )
}

function DetailRow({ label, avg, count, pts, color }: {
  label: string; avg: number; count: number; pts: number; color: string
}) {
  return (
    <div className={styles.detailRow}>
      <span className={styles.dot} style={{ background: color }} />
      <span className={styles.detailLabel}>{label}</span>
      <span className={styles.detailCount}>{count} done</span>
      <span className={styles.detailAvg}>{avg.toFixed(1)}%</span>
      <span className={styles.detailPts} style={{ color }}>{pts}pts</span>
    </div>
  )
}
