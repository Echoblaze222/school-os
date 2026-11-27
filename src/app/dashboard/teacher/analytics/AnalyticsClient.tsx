'use client'
// src/app/dashboard/teacher/analytics/AnalyticsClient.tsx
// Teacher analytics for the teacher's OWN classes/subjects only.
// Data: public.teacher_analytics(p_class, p_days) (scoped from auth.uid() in SQL).

import { useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import { TEACHER_FEATURE_GROUPS } from '../featureGroups'
import { SkeletonBlock } from '@/components/motion/Skeleton'
import {
  ChartTheme, ChartCard, TrendArea, CompareBars, Donut,
  useRpc, Chip, Stat, StatGrid, FilterRow, ErrorNote, DataTable, gridStyle,
  pct, dayLabel,
} from '@/components/charts'

interface Props { profile: any; school: any; userId: string }

type Tab = 'overview' | 'results' | 'attendance' | 'work'
const TABS: { id: Tab; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'results', label: 'Results' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'work', label: 'Assignments & quizzes' },
]
const RANGES = [{ days: 14, label: '14 days' }, { days: 30, label: '30 days' }, { days: 90, label: '90 days' }]
const DOW = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const TERM = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const STATUS_LABEL: Record<string, string> = { graded: 'Graded', submitted: 'Handed in', late: 'Late', pending: 'Not handed in' }

export default function AnalyticsClient({ profile, school, userId }: Props) {
  const brand = school?.primary_color ?? '#800020'
  const [tab, setTab] = useState<Tab>('overview')
  const [cls, setCls] = useState<string | null>(null)
  const [days, setDays] = useState(30)
  const { data: d, error, loading, refreshing } = useRpc('teacher_analytics', { p_class: cls, p_days: days })

  const classes: any[] = d?.classes ?? []
  const trend: any[] = (d?.term_trend ?? []).map((t: any) => ({ ...t, label: `${TERM(t.term)} ${t.year.slice(2, 4)}/${t.year.slice(7)}` }))
  const last = trend[trend.length - 1]
  const prev = trend.length > 1 ? trend[trend.length - 2] : null
  const delta = last && prev ? last.average - prev.average : null
  const cs: any[] = (d?.by_class_subject ?? []).map((x: any) => ({ ...x, label: classes.length > 1 && !cls ? `${x.class} · ${x.subject}` : x.subject }))
  const sorted = [...cs].sort((a, b) => b.average - a.average)
  const weakest = sorted.length ? sorted[sorted.length - 1] : null
  const att = d?.attendance
  const weekday = (att?.weekday ?? []).map((w: any) => ({ ...w, day: DOW[w.dow] }))
  const worstDay = weekday.length ? [...weekday].sort((a: any, b: any) => a.rate - b.rate)[0] : null
  const attClasses: any[] = att?.by_class ?? []
  const worstClass = attClasses.length ? [...attClasses].sort((a, b) => a.rate - b.rate)[0] : null
  const funnel: any[] = d?.assignments?.funnel ?? []
  const funnelTotal = funnel.reduce((a, f) => a + f.count, 0)
  const handedIn = funnel.filter(f => f.status !== 'pending').reduce((a, f) => a + f.count, 0)
  const quizzes: any[] = d?.quizzes ?? []
  const atRisk: any[] = d?.at_risk ?? []
  const pipe = d?.pipeline

  const insightAvg = d?.average == null ? 'No results posted for your classes yet'
    : delta == null ? `Your classes average ${pct(d.average, 1)} with ${pct(d.pass_rate, 0)} passing`
    : `Your average ${delta >= 0 ? 'rose' : 'fell'} ${Math.abs(delta).toFixed(1)} pts to ${pct(last.average, 1)} vs last term`
  const insightSubj = weakest && sorted.length > 1 ? `${weakest.label} is the weakest at ${pct(weakest.average, 1)}` : undefined
  const insightAtt = att?.rate == null ? 'No attendance marked in this window'
    : `${pct(att.rate, 1)} present${worstClass && attClasses.length > 1 ? ` · ${worstClass.class} is lowest at ${pct(worstClass.rate, 1)}` : ''}`
  const insightWork = funnelTotal ? `${pct((handedIn / funnelTotal) * 100, 0)} of assignments were handed in` : undefined

  return (
    <RoleSubHeader userId={userId} role="teacher" profile={profile} school={school} title="Analytics" featureGroups={TEACHER_FEATURE_GROUPS}>
      <ChartTheme>
        <div style={{ padding: '0 var(--space-5) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {TABS.map(t => <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} brand={brand}>{t.label}</Chip>)}
          </div>
          <FilterRow>
            {classes.length > 1 && <Chip active={cls == null} onClick={() => setCls(null)} brand={brand}>All my classes</Chip>}
            {classes.length > 1 && classes.map(c => <Chip key={c.id} active={cls === c.id} onClick={() => setCls(c.id)} brand={brand}>{c.name}</Chip>)}
            {(tab === 'overview' || tab === 'attendance') && RANGES.map(r => <Chip key={r.days} active={days === r.days} onClick={() => setDays(r.days)} brand={brand}>{r.label}</Chip>)}
          </FilterRow>
        </div>

        {error && <div style={{ padding: '0 var(--space-5) var(--space-3)' }}><ErrorNote message={error} /></div>}

        {loading ? (
          <div style={{ padding: '0 var(--space-5)', display: 'grid', gap: 12 }}>
            <SkeletonBlock height={72} radius={14} />
            <SkeletonBlock height={260} radius={14} />
          </div>
        ) : d && !classes.length ? (
          <div style={{ padding: '0 var(--space-5)' }}>
            <ChartCard title="Your classes" empty emptyText="You haven’t been assigned to a class or subject yet, so there’s nothing to analyse.">{null}</ChartCard>
          </div>
        ) : d && (
          <div className="viz-fade" style={{ padding: '0 var(--space-5)', ...gridStyle, opacity: refreshing ? 0.6 : 1 }}>

            {tab === 'overview' && (
              <>
                <StatGrid min={160}>
                  <Stat label="Average score" value={d.average == null ? '–' : pct(d.average, 1)} sub={`${d.result_count} results`} trend={trend.map(t => t.average)} />
                  <Stat label="Pass rate" value={d.pass_rate == null ? '–' : pct(d.pass_rate, 0)} sub="50% and above" />
                  <Stat label="Attendance" value={att?.rate == null ? '–' : pct(att.rate, 1)} sub={`last ${days} days`} trend={(att?.daily ?? []).slice(-12).map((x: any) => x.rate)} />
                  <Stat label="Students" value={String(d.students)} sub={`${classes.length} class${classes.length === 1 ? '' : 'es'}`} />
                </StatGrid>

                <ChartCard title="Average by term" insight={insightAvg} empty={!trend.length}
                  table={{ columns: ['Term', 'Average %', 'Pass rate %'], rows: trend.map(t => [t.label, t.average, t.pass_rate]) }}>
                  <TrendArea data={trend} xKey="label" series={[{ key: 'average', label: 'Average %' }]}
                    valueFormat={v => `${v}%`} yDomain={[0, 100]} target={{ value: 50, label: 'Pass mark' }} />
                </ChartCard>

                <ChartCard title="Students who may need help" subtitle="Average under 45% or attendance under 75%" empty={!atRisk.length} emptyText="No students flagged — nice."
                  table={{ columns: ['Student', 'Class', 'Average %', 'Attendance %'], rows: atRisk.map(s => [s.student, s.class, s.average ?? '–', s.attendance ?? '–']) }}>
                  <DataTable columns={['Student', 'Class', 'Average %', 'Attendance %']} rows={atRisk.map(s => [s.student, s.class, s.average ?? '–', s.attendance ?? '–'])} />
                </ChartCard>

                <ChartCard title="Assignment hand-in" insight={insightWork} empty={!funnel.length}
                  table={{ columns: ['Status', 'Submissions'], rows: funnel.map(f => [STATUS_LABEL[f.status] ?? f.status, f.count]) }}>
                  <Donut centerValue={String(funnelTotal)} centerLabel="submissions"
                    data={funnel.map(f => ({ label: STATUS_LABEL[f.status] ?? f.status, value: f.count, slot: ({ graded: 2, submitted: 0, late: 3, pending: 7 } as any)[f.status] }))} />
                </ChartCard>
              </>
            )}

            {tab === 'results' && (
              <>
                <StatGrid min={150}>
                  <Stat label="Average score" value={d.average == null ? '–' : pct(d.average, 1)} />
                  <Stat label="Pass rate" value={d.pass_rate == null ? '–' : pct(d.pass_rate, 0)} />
                  {pipe && <Stat label="Approved" value={`${pipe.approved}/${pipe.posted}`} sub={`${pipe.published} published`} />}
                </StatGrid>

                <ChartCard title="Average by subject" insight={insightSubj} empty={!cs.length}
                  table={{ columns: ['Class', 'Subject', 'Average %', 'Pass rate %'], rows: (d.by_class_subject ?? []).map((x: any) => [x.class, x.subject, x.average, x.pass_rate]) }}>
                  <CompareBars horizontal tipLabels data={sorted} catKey="label" series={[{ key: 'average', label: 'Average %' }]}
                    highlight={weakest?.label} valueFormat={v => `${v}%`} domainMax={100} />
                </ChartCard>

                <ChartCard title="Score spread" empty={!(d.distribution ?? []).length}
                  table={{ columns: ['Band', 'Results'], rows: (d.distribution ?? []).map((x: any) => [x.band, x.count]) }}>
                  <CompareBars data={d.distribution ?? []} catKey="band" series={[{ key: 'count', label: 'Results' }]} tipLabels />
                </ChartCard>

                <ChartCard title="Term by term" empty={!trend.length}
                  table={{ columns: ['Term', 'Average %', 'Pass rate %'], rows: trend.map(t => [t.label, t.average, t.pass_rate]) }}>
                  <TrendArea data={trend} xKey="label" series={[{ key: 'average', label: 'Average %', slot: 0 }, { key: 'pass_rate', label: 'Pass rate %', slot: 2 }]}
                    valueFormat={v => `${v}%`} yDomain={[0, 100]} />
                </ChartCard>
              </>
            )}

            {tab === 'attendance' && (
              <>
                <StatGrid min={150}>
                  <Stat label="Present rate" value={att?.rate == null ? '–' : pct(att.rate, 1)} sub={`last ${days} days`} />
                </StatGrid>

                <ChartCard title="Daily attendance" insight={insightAtt} empty={!(att?.daily ?? []).length}
                  table={{ columns: ['Date', 'Present %'], rows: (att?.daily ?? []).map((x: any) => [x.date, x.rate]) }}>
                  <TrendArea data={att?.daily ?? []} xKey="date" series={[{ key: 'rate', label: 'Present %', slot: 2 }]}
                    xFormat={dayLabel} valueFormat={v => `${v}%`} yDomain={[50, 100]} />
                </ChartCard>

                <ChartCard title="Day of week" insight={worstDay ? `${worstDay.day} is the weakest day at ${pct(worstDay.rate, 1)}` : undefined} empty={!weekday.length}
                  table={{ columns: ['Day', 'Present %'], rows: weekday.map((w: any) => [w.day, w.rate]) }}>
                  <CompareBars data={weekday} catKey="day" series={[{ key: 'rate', label: 'Present %', slot: 2 }]}
                    highlight={worstDay?.day} valueFormat={v => `${v}%`} domainMax={100} />
                </ChartCard>

                {attClasses.length > 1 && (
                  <ChartCard title="By class" empty={!attClasses.length}
                    table={{ columns: ['Class', 'Present %'], rows: attClasses.map(c => [c.class, c.rate]) }}>
                    <CompareBars horizontal tipLabels data={attClasses} catKey="class" series={[{ key: 'rate', label: 'Present %', slot: 2 }]}
                      highlight={worstClass?.class} valueFormat={v => `${v}%`} domainMax={100} />
                  </ChartCard>
                )}
              </>
            )}

            {tab === 'work' && (
              <>
                <StatGrid min={150}>
                  <Stat label="Assignments set" value={String(d.assignments?.total ?? 0)} />
                  <Stat label="Avg graded score" value={d.assignments?.avg_score_pct == null ? '–' : pct(d.assignments.avg_score_pct, 1)} />
                  <Stat label="Quizzes" value={String(quizzes.length)} />
                </StatGrid>

                <ChartCard title="Latest assignments: hand-in rate" insight={insightWork} empty={!(d.assignments?.recent ?? []).length}
                  table={{ columns: ['Assignment', 'Class', 'Due', 'Handed in %', 'Avg score %'], rows: (d.assignments?.recent ?? []).map((a: any) => [a.title, a.class, a.due, a.submitted_pct, a.avg_pct ?? '–']) }}>
                  <CompareBars horizontal tipLabels domainMax={100}
                    data={(d.assignments?.recent ?? []).map((a: any) => ({ ...a, label: a.title.replace(/ – demo assignment/, '') }))} catKey="label"
                    series={[{ key: 'submitted_pct', label: 'Handed in %' }]} valueFormat={v => `${v}%`} />
                </ChartCard>

                <ChartCard title="Quizzes" subtitle="Average score and how many students took part" empty={!quizzes.length}
                  table={{ columns: ['Quiz', 'Class', 'Took part %', 'Average %', 'Pass rate %'], rows: quizzes.map(q => [q.title, q.class, q.participation ?? '–', q.average ?? '–', q.pass_rate ?? '–']) }}>
                  <CompareBars horizontal tipLabels domainMax={100}
                    data={quizzes.map(q => ({ ...q, label: q.title.replace(/ – demo quiz/, '') }))} catKey="label"
                    series={[{ key: 'average', label: 'Average %', slot: 0 }]} valueFormat={v => `${v}%`} />
                </ChartCard>
              </>
            )}

            <div style={{ height: 24 }} />
          </div>
        )}
      </ChartTheme>
    </RoleSubHeader>
  )
}
