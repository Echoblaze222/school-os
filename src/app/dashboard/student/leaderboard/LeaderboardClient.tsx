'use client'
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
  childIds?: string[]
}

function getCurrentTerm() {
  const m = new Date().getMonth() + 1
  if (m >= 9 || m <= 1) return 'First Term'
  if (m >= 5)           return 'Third Term'
  return 'Second Term'
}
function getCurrentYear() {
  const now = new Date(); const m = now.getMonth() + 1; const y = now.getFullYear()
  return m >= 9 ? `${y}/${y + 1}` : `${y - 1}/${y}`
}
function safePct(score: number | null, max: number | null): number {
  const s = score ?? 0
  const m = max && max > 0 ? max : 100
  return Math.min(100, (s / m) * 100)
}

export default function LeaderboardClient({ profile, school, userId, childIds = [] }: Props) {
  const [board, setBoard]       = useState<LeaderboardEntry[]>([])
  const [loading, setLoading]   = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [debugMsg, setDebugMsg] = useState('')

  const supabase    = createClient()
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const isParent    = profile?.role === 'parent'

  const isHighlighted = (e: LeaderboardEntry) =>
    isParent ? childIds.includes(e.student_id) : e.student_id === userId

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      // ── Try RPC first ──────────────────────────────────────
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_class_leaderboard', {
        p_school_id: school?.id,
        p_limit: 50,
      })

      if (!rpcErr && rpcData && rpcData.length > 0) {
        setBoard(rpcData as LeaderboardEntry[])
        setLoading(false)
        return
      }

      if (rpcErr) console.warn('RPC failed, falling back to direct query:', rpcErr.message)
      else        console.warn('RPC returned empty, falling back to direct query')

      // ── Fallback: compute scores directly ─────────────────
      await loadDirect()
    } catch (e) {
      console.error('load error:', e)
      setLoading(false)
    }
  }

  async function loadDirect() {
    const term = getCurrentTerm()
    const year = getCurrentYear()

    // 1. All students in this school with their class
    const { data: students, error: sErr } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, student_profiles(class_id, classes(name, class_level))')
      .eq('school_id', school?.id)
      .eq('role', 'student')

    if (sErr || !students?.length) {
      console.error('students fetch failed:', sErr)
      setDebugMsg(sErr ? `Error: ${sErr.message}` : 'No students found in this school.')
      setLoading(false)
      return
    }

    const studentIds = students.map((s: any) => s.id)

    // 2. Fetch all activity data in parallel
    const [
      { data: quizAttempts },
      { data: asgSubs },
      { data: results },
    ] = await Promise.all([
      supabase
        .from('quiz_attempts')
        .select('student_id, quiz_id, score, max_score')
        .in('student_id', studentIds),

      supabase
        .from('assignment_submissions')
        .select('student_id, assignment_id, score, assignments(max_score, class_id)')
        .in('student_id', studentIds)
        .eq('status', 'graded'),

      supabase
        .from('results')
        .select('student_id, score, max_score')
        .in('student_id', studentIds)
        .eq('term', term)
        .eq('academic_year', year)
        .eq('approved', true),
    ])

    // 3. Group by student and calculate scores
    const entries: LeaderboardEntry[] = students.map((s: any) => {
      const sp         = Array.isArray(s.student_profiles) ? s.student_profiles[0] : s.student_profiles
      const classLevel = sp?.classes?.class_level ?? sp?.classes?.name ?? '—'
      const classId    = sp?.class_id ?? null

      // Quiz avg
      const myQuizzes = (quizAttempts ?? []).filter((q: any) => q.student_id === s.id)
      // Best attempt per quiz
      const quizByQuiz: Record<string, number> = {}
      myQuizzes.forEach((q: any) => {
        const pct = safePct(q.score, q.max_score)
        if (!quizByQuiz[q.quiz_id] || pct > quizByQuiz[q.quiz_id]) quizByQuiz[q.quiz_id] = pct
      })
      const quizVals    = Object.values(quizByQuiz)
      const quizAvg     = quizVals.length > 0 ? quizVals.reduce((a, b) => a + b, 0) / quizVals.length : 0
      const quizzesTaken = quizVals.length

      // Assignment avg
      const myAsg = (asgSubs ?? []).filter((a: any) => a.student_id === s.id && a.score != null)
      const asgAvg = myAsg.length > 0
        ? myAsg.reduce((sum: number, a: any) => sum + safePct(a.score, (a.assignments as any)?.max_score), 0) / myAsg.length
        : 0

      // Results avg
      const myRes = (results ?? []).filter((r: any) => r.student_id === s.id && r.score != null)
      const resAvg = myRes.length > 0
        ? myRes.reduce((sum: number, r: any) => sum + safePct(r.score, r.max_score), 0) / myRes.length
        : 0

      // Weighted total on 1000-point scale
      const quizContrib = Math.round(quizAvg * 4)
      const asgContrib  = Math.round(asgAvg  * 3.5)
      const resContrib  = Math.round(resAvg   * 2.5)
      const total       = quizContrib + asgContrib + resContrib

      return {
        student_id:              s.id,
        full_name:               s.full_name,
        avatar_url:              s.avatar_url,
        class_level:             classLevel,
        class_id:                classId,
        quiz_avg:                Math.round(quizAvg * 10) / 10,
        assignment_avg:          Math.round(asgAvg  * 10) / 10,
        result_avg:              Math.round(resAvg   * 10) / 10,
        quizzes_taken:           quizzesTaken,
        assignments_done:        myAsg.length,
        results_count:           myRes.length,
        total_score:             total,
        quiz_contribution:       quizContrib,
        assignment_contribution: asgContrib,
        result_contribution:     resContrib,
      }
    })

    // Sort by total_score desc
    entries.sort((a, b) => b.total_score - a.total_score || a.full_name.localeCompare(b.full_name))
    setBoard(entries)
    setLoading(false)
  }

  const medals   = ['🥇', '🥈', '🥉']
  const topThree = board.slice(0, 3)
  const rest     = board.slice(3)
  const pct      = (score: number) => Math.min(100, Math.round((score / 1000) * 100))

  const pinnedEntries = board
    .map((entry, i) => ({ entry, rank: i + 1 }))
    .filter(({ entry, rank }) => isHighlighted(entry) && rank > 3)

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader
          userId={userId}
          role={isParent ? 'parent' : 'student'}
          profile={profile} school={school}
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
              <p>{debugMsg || 'No scores yet — complete quizzes, assignments, or exams to appear here.'}</p>
            </div>
          ) : (
            <>
              {pinnedEntries.map(({ entry, rank }) => (
                <div key={entry.student_id} className={styles.myRankBanner} style={{ borderColor: schoolColor }}>
                  <span style={{ color: schoolColor, fontWeight: 800, fontSize: '1.1rem' }}>#{rank}</span>
                  <div style={{ flex: 1, marginLeft: 10 }}>
                    <p style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '0.88rem', margin: 0 }}>
                      {entry.full_name}
                      <span style={{ color: schoolColor, fontSize: '0.75rem', marginLeft: 6 }}>
                        {isParent ? 'Your child' : '(You)'}
                      </span>
                    </p>
                    <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', margin: 0 }}>{entry.class_level}</p>
                  </div>
                  <span style={{ fontWeight: 800, color: schoolColor }}>{entry.total_score}pts</span>
                </div>
              ))}

              <div className={styles.legend}>
                <span><span className={styles.dot} style={{ background: '#6366f1' }} />Quiz 40%</span>
                <span><span className={styles.dot} style={{ background: '#f59e0b' }} />Assign. 35%</span>
                <span><span className={styles.dot} style={{ background: '#10b981' }} />Results 25%</span>
              </div>

              {topThree.length > 0 && (
                <div className={styles.podium}>
                  {topThree.map((entry, i) => {
                    const hl = isHighlighted(entry)
                    return (
                      <div
                        key={entry.student_id}
                        className={`${styles.podiumCard} ${i === 0 ? styles.podiumFirst : ''}`}
                        style={hl ? { borderColor: schoolColor, background: schoolColor + '10' } : {}}
                        onClick={() => setExpanded(expanded === entry.student_id ? null : entry.student_id)}
                      >
                        <div className={styles.podiumMedal}>{medals[i]}</div>
                        <div className={styles.podiumAvatar} style={{ background: schoolColor + '30', color: schoolColor }}>
                          {entry.avatar_url
                            ? <img src={entry.avatar_url} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            : entry.full_name.charAt(0).toUpperCase()}
                        </div>
                        <p className={styles.podiumName}>
                          {entry.full_name.split(' ')[0]}
                          {hl && <span style={{ display: 'block', fontSize: '0.62rem', color: schoolColor, fontWeight: 700 }}>{isParent ? 'Your child' : 'You'}</span>}
                        </p>
                        <p className={styles.podiumClass}>{entry.class_level}</p>
                        <div className={styles.scoreRing}>
                          <svg viewBox="0 0 36 36" className={styles.ringsvg}>
                            <circle cx="18" cy="18" r="15.9" fill="none" stroke="var(--glass-border)" strokeWidth="2.5" />
                            <circle cx="18" cy="18" r="15.9" fill="none"
                              stroke={i === 0 ? '#F59E0B' : schoolColor}
                              strokeWidth="2.5"
                              strokeDasharray={`${pct(entry.total_score)} ${100 - pct(entry.total_score)}`}
                              strokeDashoffset="25" strokeLinecap="round"
                            />
                          </svg>
                          <span className={styles.ringScore} style={{ color: i === 0 ? '#F59E0B' : schoolColor }}>{entry.total_score}</span>
                        </div>
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

              <div className={styles.list}>
                {rest.map((entry, i) => {
                  const rank = i + 4
                  const hl   = isHighlighted(entry)
                  const open = expanded === entry.student_id
                  return (
                    <div key={entry.student_id} className={styles.card}
                      style={hl ? { borderColor: schoolColor, background: schoolColor + '0D' } : {}}
                      onClick={() => setExpanded(open ? null : entry.student_id)}
                    >
                      <div className={styles.rankBadge}>#{rank}</div>
                      <div className={styles.cardBody}>
                        <p className={styles.cardTitle}>
                          {entry.full_name}
                          {hl && <span style={{ color: schoolColor, fontSize: '0.72rem', marginLeft: 6, fontWeight: 700 }}>{isParent ? '· Your child' : '· You'}</span>}
                        </p>
                        <p className={styles.cardMeta}>{entry.class_level}</p>
                        <div className={styles.miniBar}>
                          <div style={{ width: `${(entry.quiz_contribution / 1000) * 100}%`, background: '#6366f1' }} />
                          <div style={{ width: `${(entry.assignment_contribution / 1000) * 100}%`, background: '#f59e0b' }} />
                          <div style={{ width: `${(entry.result_contribution / 1000) * 100}%`, background: '#10b981' }} />
                        </div>
                        {open && (
                          <div className={styles.expandedDetail}>
                            <DetailRow label="Quizzes"     avg={entry.quiz_avg}       count={entry.quizzes_taken}    pts={entry.quiz_contribution}       color="#6366f1" />
                            <DetailRow label="Assignments" avg={entry.assignment_avg} count={entry.assignments_done} pts={entry.assignment_contribution} color="#f59e0b" />
                            <DetailRow label="Results"     avg={entry.result_avg}     count={entry.results_count}    pts={entry.result_contribution}     color="#10b981" />
                          </div>
                        )}
                      </div>
                      <div className={styles.scoreCol}>
                        <p className={styles.scoreValue} style={hl ? { color: schoolColor } : {}}>{entry.total_score}</p>
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

function DetailRow({ label, avg, count, pts, color }: { label: string; avg: number; count: number; pts: number; color: string }) {
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
