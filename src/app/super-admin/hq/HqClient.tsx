'use client'
// src/app/super-admin/hq/HqClient.tsx
import { useEffect, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import styles from './hq.module.css'

interface HqData {
  stats: {
    loginsToday: number
    loginsYesterday: number
    loginsLast7Days: number
    activeSchoolsLast7Days: number
    topRoleLast7Days: string | null
  }
  briefing: string
  hourly: { hour: number; count: number }[]
  dailyActiveUsers: { date: string; count: number }[]
}

export default function HqClient() {
  const [data, setData] = useState<HqData | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/super-admin/hq')
      .then(res => res.json())
      .then(json => { if (json.ok) setData(json); else setError(json.error || 'Failed to load.') })
      .catch(() => setError('Failed to load.'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}><span /><span /><span /></div>
      </div>
    )
  }

  if (error || !data) {
    return <div className={styles.page}><div className={styles.empty}>{error || 'Something went wrong.'}</div></div>
  }

  const { stats, briefing, hourly, dailyActiveUsers } = data

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>HQ</h1>
        <p className={styles.sub}>Not linked anywhere - this page only exists at this URL.</p>
      </div>

      <div className={styles.briefingCard}>{briefing}</div>

      <div className={styles.statsGrid}>
        <div className={styles.statCard}>
          <p className={styles.statVal}>{stats.loginsToday}</p>
          <p className={styles.statLbl}>Logins Today</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal}>{stats.loginsYesterday}</p>
          <p className={styles.statLbl}>Yesterday</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal}>{stats.loginsLast7Days}</p>
          <p className={styles.statLbl}>Last 7 Days</p>
        </div>
        <div className={styles.statCard}>
          <p className={styles.statVal}>{stats.activeSchoolsLast7Days}</p>
          <p className={styles.statLbl}>Active Schools (7d)</p>
        </div>
      </div>

      <div className={styles.chartCard}>
        <p className={styles.chartTitle}>Logins by Hour of Day (last 7 days)</p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={hourly}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
            <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} stroke="var(--text-muted)" fontSize={11} />
            <YAxis allowDecimals={false} stroke="var(--text-muted)" fontSize={11} />
            <Tooltip labelFormatter={(h) => `${h}:00`} contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 8 }} />
            <Bar dataKey="count" fill="var(--brand)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className={styles.chartCard}>
        <p className={styles.chartTitle}>Daily Active Logins (last 30 days)</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={dailyActiveUsers}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--glass-border)" />
            <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="var(--text-muted)" fontSize={11} />
            <YAxis allowDecimals={false} stroke="var(--text-muted)" fontSize={11} />
            <Tooltip contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 8 }} />
            <Line type="monotone" dataKey="count" stroke="var(--brand)" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
