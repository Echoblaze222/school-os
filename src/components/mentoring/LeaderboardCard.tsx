'use client'
// src/components/mentoring/LeaderboardCard.tsx
// Star mentors of the month. Points: 10 per finished session + the star rating the mentee gave.
// Rank 1 (with at least one finished session) is the "Star Mentor of the Month".

import { useEffect, useState } from 'react'
import type { createClient } from '@/lib/supabase/client'
import { StarIcon } from '@/components/Icons'
import StarRating from './StarRating'
import styles from './leaderboard.module.css'

export interface LeaderRow {
  rank: number
  mentor_id: string
  student_id: string
  student_name: string | null
  subject_name: string
  sessions_done: number
  avg_rating: number | null
  points: number
  is_star: boolean
}

interface Props {
  supabase: ReturnType<typeof createClient>
  title?: string
  myStudentId?: string
  allowLastMonth?: boolean
  /** change this value to make the card refetch (e.g. after a realtime update) */
  refreshKey?: number
}

function firstOfMonth(offset: number): { date: string; label: string } {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() + offset)
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`,
    label: d.toLocaleDateString('en-NG', { month: 'long', year: 'numeric' }),
  }
}

export default function LeaderboardCard({ supabase, title = 'Star mentors', myStudentId, allowLastMonth, refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<LeaderRow[] | null>(null)
  const [last, setLast] = useState(false)
  const month = firstOfMonth(last ? -1 : 0)

  useEffect(() => {
    let off = false
    ;(async () => {
      const { data } = await supabase.rpc('mentoring_leaderboard', { p_month: month.date })
      if (!off) setRows((data ?? []) as LeaderRow[])
    })()
    return () => { off = true }
  }, [supabase, month.date, refreshKey])

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <h3 className={styles.title}>{title}</h3>
          <p className={styles.sub}>{month.label}. 10 points a finished session, plus the stars mentees give.</p>
        </div>
        {allowLastMonth && (
          <div className={styles.toggle}>
            <button className={`${styles.pill} ${!last ? styles.pillOn : ''}`} onClick={() => setLast(false)}>This month</button>
            <button className={`${styles.pill} ${last ? styles.pillOn : ''}`} onClick={() => setLast(true)}>Last month</button>
          </div>
        )}
      </div>

      {rows === null ? null : rows.length === 0 ? (
        <p className={styles.empty}>No finished sessions yet this month.</p>
      ) : rows.map(r => (
        <div key={r.mentor_id} className={`${styles.row} ${r.student_id === myStudentId ? styles.mine : ''}`}>
          <span className={`${styles.rank} ${r.is_star ? styles.rankStar : ''}`}>{r.rank}</span>
          <div className={styles.who}>
            <p className={styles.name}>{r.student_name ?? 'Student'}</p>
            <p className={styles.meta}>
              {r.subject_name}, {r.sessions_done} session{r.sessions_done === 1 ? '' : 's'}
              {r.avg_rating != null && <> <StarRating value={r.avg_rating} size={11} /></>}
            </p>
            {r.is_star && (
              <span className={styles.starTag}><StarIcon size={11} color="currentColor" /> Star Mentor of the Month</span>
            )}
          </div>
          <div className={styles.points}>{r.points}<span className={styles.pointsLabel}>points</span></div>
        </div>
      ))}
    </div>
  )
}
