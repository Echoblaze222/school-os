'use client'
// Compact analytics block shown on every role's home screen (rendered by RoleHeroHeader).
// Full versions live at /dashboard/<role>/analytics. Errors render nothing: the home
// screen must never break because analytics are unavailable for a given login.

import Link from 'next/link'
import type { ReactNode } from 'react'
import { SkeletonBlock } from '@/components/motion/Skeleton'
import {
  ChartTheme, ChartCard, TrendArea, CompareBars, useRpc, Stat, StatGrid,
  naira, nairaFull, pct, dayLabel,
} from '@/components/charts'
import { Card } from './RoleAnalyticsPanel'

const DECLARATIVE: Record<string, string> = {
  secretary: 'secretary_analytics',
  librarian: 'librarian_analytics',
  nurse: 'nurse_analytics',
  counselor: 'counselor_analytics',
  hostel: 'hostel_analytics',
  ict: 'ict_analytics',
  examination: 'exam_analytics',
  coach: 'coach_analytics',
  'vice-principal': 'vice_principal_analytics',
}

function Frame({ role, children }: { role: string; children: ReactNode }) {
  return (
    <ChartTheme>
      <section style={{ maxWidth: 880, margin: '16px auto 0', padding: '0 var(--space-5)', display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <h2 style={{ margin: 0, fontSize: '0.8rem', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>At a glance</h2>
          <Link href={`/dashboard/${role}/analytics`} style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand)' }}>Full analytics →</Link>
        </div>
        {children}
      </section>
    </ChartTheme>
  )
}

const Loading = () => (
  <div style={{ display: 'grid', gap: 12 }}>
    <SkeletonBlock height={72} radius={20} />
    <SkeletonBlock height={220} radius={20} />
  </div>
)

function DeclarativeHome({ role, rpc }: { role: string; rpc: string }) {
  const { data: d, error, loading } = useRpc(rpc, {})
  if (error) return null
  const tab = (d?.tabs ?? [])[0]
  if (!loading && !tab) return null
  return (
    <Frame role={role}>
      {loading ? <Loading /> : (
        <>
          {(tab.stats ?? []).length > 0 && (
            <StatGrid min={140}>
              {(tab.stats ?? []).slice(0, 4).map((s: any) => <Stat key={s.label} label={s.label} value={s.value} sub={s.sub} />)}
            </StatGrid>
          )}
          {(tab.cards ?? []).slice(0, 2).map((c: any) => <Card key={c.title} c={c} />)}
        </>
      )}
    </Frame>
  )
}

function BursarHome() {
  const { data: d, error, loading } = useRpc('bursar_analytics', { p_days: 180 })
  if (error) return null
  const weekly: any[] = d?.weekly ?? []
  const cash: any[] = (d?.cashflow ?? []).map((c: any) => ({ ...c, label: c.month }))
  const billed = d?.billed ?? 0
  const collectedPct = billed > 0 ? ((d?.collected ?? 0) / billed) * 100 : null
  const net = d ? d.collected_window - d.expenses_window : 0
  return (
    <Frame role="bursar">
      {loading || !d ? <Loading /> : (
        <>
          <StatGrid min={140}>
            <Stat label="Collected" value={naira(d.collected_window)} sub="last 6 months" trend={weekly.slice(-12).map(w => w.collected)} />
            <Stat label="Outstanding" value={naira(d.outstanding)} />
            <Stat label="Expenses" value={naira(d.expenses_window)} />
            <Stat label="Net position" value={`${net < 0 ? '-' : ''}${naira(Math.abs(net))}`} />
          </StatGrid>
          <ChartCard title="Collections per week" empty={!weekly.length}
            insight={collectedPct == null ? undefined : `${pct(collectedPct, 0)} of billed fees collected · ${naira(d.outstanding)} still outstanding`}
            table={{ columns: ['Week of', 'Collected'], rows: weekly.map(w => [w.week, nairaFull(w.collected)]) }}>
            <TrendArea data={weekly} xKey="week" series={[{ key: 'collected', label: 'Collected' }]}
              xFormat={dayLabel} yFormat={naira} valueFormat={nairaFull} height={200} />
          </ChartCard>
          <ChartCard title="Collected vs expenses" empty={!cash.length}
            table={{ columns: ['Month', 'Collected', 'Expenses'], rows: cash.map(c => [c.month, nairaFull(c.collected), nairaFull(c.expenses)]) }}>
            <CompareBars data={cash} catKey="label"
              series={[{ key: 'collected', label: 'Collected', slot: 0 }, { key: 'expenses', label: 'Expenses', slot: 1 }]}
              axisFormat={naira} valueFormat={nairaFull} />
          </ChartCard>
        </>
      )}
    </Frame>
  )
}

const TERM = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

function TeacherHome() {
  const { data: d, error, loading } = useRpc('teacher_analytics', { p_class: null, p_days: 30 })
  if (error) return null
  if (!loading && !(d?.classes ?? []).length) return null
  const trend: any[] = (d?.term_trend ?? []).map((t: any) => ({ ...t, label: `${TERM(t.term)} ${String(t.year).slice(2, 4)}/${String(t.year).slice(7)}` }))
  const att = d?.attendance
  const daily: any[] = att?.daily ?? []
  return (
    <Frame role="teacher">
      {loading || !d ? <Loading /> : (
        <>
          <StatGrid min={140}>
            <Stat label="Average score" value={d.average == null ? '–' : pct(d.average, 1)} sub={`${d.result_count} results`} trend={trend.map(t => t.average)} />
            <Stat label="Pass rate" value={d.pass_rate == null ? '–' : pct(d.pass_rate, 0)} sub="50% and above" />
            <Stat label="Attendance" value={att?.rate == null ? '–' : pct(att.rate, 1)} sub="last 30 days" trend={daily.slice(-12).map((x: any) => x.rate)} />
            <Stat label="Students" value={String(d.students)} />
          </StatGrid>
          <ChartCard title="Average by term" empty={!trend.length}
            table={{ columns: ['Term', 'Average %', 'Pass rate %'], rows: trend.map(t => [t.label, t.average, t.pass_rate]) }}>
            <TrendArea data={trend} xKey="label" series={[{ key: 'average', label: 'Average %' }]}
              valueFormat={v => `${v}%`} yDomain={[0, 100]} target={{ value: 50, label: 'Pass mark' }} height={200} />
          </ChartCard>
          <ChartCard title="Daily attendance" empty={!daily.length}
            table={{ columns: ['Date', 'Present %'], rows: daily.map((x: any) => [x.date, x.rate]) }}>
            <TrendArea data={daily} xKey="date" series={[{ key: 'rate', label: 'Present %', slot: 2 }]}
              xFormat={dayLabel} valueFormat={v => `${v}%`} yDomain={[50, 100]} height={200} />
          </ChartCard>
        </>
      )}
    </Frame>
  )
}

function StudentHome({ audience }: { audience: 'student' | 'parent' }) {
  const isParent = audience === 'parent'
  const { data: d, error, loading } = useRpc(
    isParent ? 'parent_analytics' : 'student_analytics',
    isParent ? { p_child: null, p_term: null, p_year: null, p_days: 30 } : { p_term: null, p_year: null, p_days: 30 },
  )
  if (error) return null
  if (!loading && d && !d.student) return null
  const first = (d?.student?.name ?? '').split(' ')[0] || 'Your child'
  const me = isParent ? first : 'Me'
  const trend: any[] = (d?.trend ?? []).map((t: any) => ({ ...t, label: `${TERM(t.term)} ${String(t.year).slice(2, 4)}/${String(t.year).slice(7)}` }))
  const subjects: any[] = d?.subjects ?? []
  const att = d?.attendance
  return (
    <Frame role={audience}>
      {loading || !d ? <Loading /> : (
        <>
          <StatGrid min={140}>
            <Stat label={isParent ? `${first}’s average` : 'My average'} value={d.average == null ? '–' : pct(d.average, 1)} trend={trend.map(t => t.mine)} />
            <Stat label="Class average" value={d.class_average == null ? '–' : pct(d.class_average, 1)} />
            <Stat label="Attendance" value={att?.rate == null ? '–' : pct(att.rate, 0)} sub="last 30 days" />
          </StatGrid>
          <ChartCard title="Average by term" empty={!trend.length}
            table={{ columns: ['Term', 'Average %', 'Class average %'], rows: trend.map(t => [t.label, t.mine, t.class ?? '–']) }}>
            <TrendArea data={trend} xKey="label"
              series={[{ key: 'mine', label: me, slot: 0 }, { key: 'class', label: 'Class average', slot: 1 }]}
              valueFormat={v => `${v}%`} yDomain={[0, 100]} height={200} />
          </ChartCard>
          <ChartCard title="Subjects" empty={!subjects.length}
            table={{ columns: ['Subject', 'Score %', 'Class average %'], rows: subjects.map(s => [s.subject, s.mine, s.class ?? '–']) }}>
            <CompareBars horizontal data={subjects} catKey="subject" domainMax={100} valueFormat={v => `${v}%`}
              series={[{ key: 'mine', label: me, slot: 0 }, { key: 'class', label: 'Class average', slot: 1 }]} />
          </ChartCard>
        </>
      )}
    </Frame>
  )
}

export default function RoleHomeCharts({ role }: { role: string }) {
  if (role === 'bursar') return <BursarHome />
  if (role === 'teacher') return <TeacherHome />
  if (role === 'student' || role === 'parent') return <StudentHome audience={role} />
  const rpc = DECLARATIVE[role]
  return rpc ? <DeclarativeHome role={role} rpc={rpc} /> : null
}
