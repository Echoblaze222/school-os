'use client'
// Shared by the Student and Parent analytics pages.
// Data: student_analytics(...) or parent_analytics(...) (privacy enforced in SQL).

import { useState } from 'react'
import { SkeletonBlock } from '@/components/motion/Skeleton'
import {
  ChartTheme, ChartCard, TrendArea, CompareBars, Donut,
  useRpc, Chip, Stat, StatGrid, FilterRow, ErrorNote, DataTable, gridStyle,
  naira, nairaFull, pct, monthLabel, dayLabel,
} from '@/components/charts'

type Audience = 'student' | 'parent'
type Tab = 'progress' | 'attendance' | 'work' | 'fees'

const TERM = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)
const RANGES = [{ days: 30, label: '30 days' }, { days: 60, label: '60 days' }, { days: 120, label: '4 months' }]
const STATUS: Record<string, string> = { graded: 'Marked', submitted: 'Handed in', late: 'Handed in late', pending: 'Not handed in' }
const STATUS_SLOT: Record<string, number> = { graded: 2, submitted: 0, late: 3, pending: 7 }

function mondayOf(date: string): string {
  const dt = new Date(`${date}T00:00:00Z`)
  dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7))
  return dt.toISOString().slice(0, 10)
}

export default function StudentProgressPanel({ audience, brand }: { audience: Audience; brand: string }) {
  const isParent = audience === 'parent'
  const [tab, setTab] = useState<Tab>('progress')
  const [child, setChild] = useState<string | null>(null)
  const [sel, setSel] = useState<{ term: string; year: string } | null>(null)
  const [days, setDays] = useState(60)

  const rpc = isParent ? 'parent_analytics' : 'student_analytics'
  const args = isParent
    ? { p_child: child, p_term: sel?.term ?? null, p_year: sel?.year ?? null, p_days: days }
    : { p_term: sel?.term ?? null, p_year: sel?.year ?? null, p_days: days }
  const { data: d, error, loading, refreshing } = useRpc(rpc, args)

  const tabs: { id: Tab; label: string }[] = [
    { id: 'progress', label: 'Progress' }, { id: 'attendance', label: 'Attendance' }, { id: 'work', label: 'Homework & quizzes' },
    ...(isParent ? [{ id: 'fees' as Tab, label: 'Fees' }] : []),
  ]

  const kids: any[] = d?.children ?? []
  const name: string = d?.student?.name ?? ''
  const first = name.split(' ')[0] || 'Your child'
  const who = isParent ? first : 'You'
  const verb = isParent ? 'is' : 'are'

  const terms: any[] = d?.terms ?? []
  const subjects: any[] = d?.subjects ?? []
  const trend: any[] = (d?.trend ?? []).map((t: any) => ({ ...t, label: `${TERM(t.term)} ${t.year.slice(2, 4)}/${t.year.slice(7)}` }))
  const best = subjects[0]
  const worst = subjects.length > 1 ? subjects[subjects.length - 1] : null
  const gap = d?.average != null && d?.class_average != null ? d.average - d.class_average : null
  const prev = trend.length > 1 ? trend[trend.length - 2] : null
  const lastT = trend[trend.length - 1]
  const change = prev && lastT ? lastT.mine - prev.mine : null

  const att = d?.attendance
  const weeks = (() => {
    const m = new Map<string, { p: number; n: number }>()
    for (const x of att?.days ?? []) {
      const k = mondayOf(x.date); const c = m.get(k) ?? { p: 0, n: 0 }
      c.n++; if (x.status !== 'absent') c.p++; m.set(k, c)
    }
    return [...m.entries()].sort().map(([week, c]) => ({ week, rate: Math.round((c.p / c.n) * 1000) / 10 }))
  })()
  const statusMix = [
    { label: 'Present', value: att?.present ?? 0, slot: 2 },
    { label: 'Late', value: att?.late ?? 0, slot: 3 },
    { label: 'Absent', value: att?.absent ?? 0, slot: 7 },
  ].filter(s => s.value > 0)

  const funnel: any[] = d?.assignments?.funnel ?? []
  const todo: any[] = d?.assignments?.to_do ?? []
  const overdue = todo.filter(t => t.overdue).length
  const quizzes: any[] = d?.quizzes ?? []
  const fees = d?.fees
  const paidPct = fees && fees.billed > 0 ? (fees.paid / fees.billed) * 100 : 0

  const insightProg = d?.average == null ? 'No approved results for this term yet'
    : gap == null ? `${who} ${verb} averaging ${pct(d.average, 1)}`
    : `${who} ${verb} ${Math.abs(gap).toFixed(1)} pts ${gap >= 0 ? 'above' : 'below'} the class average (${pct(d.average, 1)} vs ${pct(d.class_average, 1)})`
  const insightTrend = change == null ? undefined
    : `${isParent ? first + '’s' : 'Your'} average ${change >= 0 ? 'rose' : 'fell'} ${Math.abs(change).toFixed(1)} pts since last term`
  const insightSubj = best && worst ? `${best.subject} is strongest (${pct(best.mine, 0)}); ${worst.subject} needs the most attention (${pct(worst.mine, 0)})` : undefined
  const insightAtt = att?.rate == null ? 'No attendance recorded in this period'
    : `${pct(att.rate, 0)} present · ${att.absent} day${att.absent === 1 ? '' : 's'} absent, ${att.late} late`
  const insightWork = overdue ? `${overdue} homework${overdue === 1 ? '' : 's'} not handed in and past due` : funnel.length ? 'All caught up on homework' : undefined

  return (
    <ChartTheme>
      <div style={{ padding: '0 var(--space-5) var(--space-3)', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div role="tablist" style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
          {tabs.map(t => <Chip key={t.id} active={tab === t.id} onClick={() => setTab(t.id)} brand={brand}>{t.label}</Chip>)}
        </div>
        <FilterRow>
          {isParent && kids.length > 1 && kids.map(k => (
            <Chip key={k.id} active={d?.student?.id === k.id} onClick={() => { setChild(k.id); setSel(null) }} brand={brand}>{k.name}{k.class ? ` · ${k.class}` : ''}</Chip>
          ))}
        </FilterRow>
        <FilterRow>
          {(tab === 'progress' || tab === 'work') && terms.map(t => (
            <Chip key={`${t.year}-${t.term}`} active={d?.term === t.term && d?.year === t.year} onClick={() => setSel({ term: t.term, year: t.year })} brand={brand}>
              {TERM(t.term)} {t.year.slice(2, 4)}/{t.year.slice(7)}
            </Chip>
          ))}
          {tab === 'attendance' && RANGES.map(r => <Chip key={r.days} active={days === r.days} onClick={() => setDays(r.days)} brand={brand}>{r.label}</Chip>)}
        </FilterRow>
      </div>

      {error && <div style={{ padding: '0 var(--space-5) var(--space-3)' }}><ErrorNote message={error} /></div>}

      {loading ? (
        <div style={{ padding: '0 var(--space-5)', display: 'grid', gap: 12 }}>
          <SkeletonBlock height={72} radius={14} />
          <SkeletonBlock height={260} radius={14} />
        </div>
      ) : d && !d.student ? (
        <div style={{ padding: '0 var(--space-5)' }}>
          <ChartCard title="My children" empty emptyText="No children are linked to your account yet. Ask the school office to link them.">{null}</ChartCard>
        </div>
      ) : d && (
        <div className="viz-fade" style={{ padding: '0 var(--space-5)', ...gridStyle, opacity: refreshing ? 0.6 : 1 }}>

          {tab === 'progress' && (
            <>
              <StatGrid min={150}>
                <Stat label={`${isParent ? first + '’s' : 'My'} average`} value={d.average == null ? '–' : pct(d.average, 1)} sub={`${TERM(d.term ?? '')} term`} trend={trend.map(t => t.mine)} />
                <Stat label="Class average" value={d.class_average == null ? '–' : pct(d.class_average, 1)} sub={d.student?.class ?? undefined} />
                {best && <Stat label="Strongest subject" value={best.subject} sub={pct(best.mine, 0)} />}
              </StatGrid>

              <ChartCard title="Average by term" insight={insightTrend ?? insightProg} empty={!trend.length}
                table={{ columns: ['Term', 'Average %', 'Class average %'], rows: trend.map(t => [t.label, t.mine, t.class ?? '–']) }}>
                <TrendArea data={trend} xKey="label"
                  series={[{ key: 'mine', label: isParent ? first : 'Me', slot: 0 }, { key: 'class', label: 'Class average', slot: 1 }]}
                  valueFormat={v => `${v}%`} yDomain={[0, 100]} />
              </ChartCard>

              <ChartCard title="Subjects" insight={insightSubj} empty={!subjects.length}
                table={{ columns: ['Subject', 'Score %', 'Class average %'], rows: subjects.map(s => [s.subject, s.mine, s.class ?? '–']) }}>
                <CompareBars horizontal data={subjects} catKey="subject" domainMax={100} valueFormat={v => `${v}%`}
                  series={[{ key: 'mine', label: isParent ? first : 'Me', slot: 0 }, { key: 'class', label: 'Class average', slot: 1 }]} />
              </ChartCard>
            </>
          )}

          {tab === 'attendance' && (
            <>
              <StatGrid min={140}>
                <Stat label="Present" value={att?.rate == null ? '–' : pct(att.rate, 0)} sub={`last ${days} days`} />
                <Stat label="Days absent" value={String(att?.absent ?? 0)} />
                <Stat label="Days late" value={String(att?.late ?? 0)} />
              </StatGrid>

              <ChartCard title="Attendance by week" insight={insightAtt} empty={!weeks.length}
                table={{ columns: ['Week of', 'Present %'], rows: weeks.map(w => [w.week, w.rate]) }}>
                <CompareBars data={weeks} catKey="week" series={[{ key: 'rate', label: 'Present %', slot: 2 }]} valueFormat={v => `${v}%`} domainMax={100} />
              </ChartCard>

              <ChartCard title="Days by status" empty={!statusMix.length}
                table={{ columns: ['Status', 'Days'], rows: statusMix.map(s => [s.label, s.value]) }}>
                <Donut data={statusMix} centerValue={att?.rate == null ? undefined : pct(att.rate, 0)} centerLabel="present" />
              </ChartCard>
            </>
          )}

          {tab === 'work' && (
            <>
              <ChartCard title="Homework" insight={insightWork} empty={!funnel.length}
                subtitle={d.assignments?.avg_pct != null ? `Average mark on marked homework: ${pct(d.assignments.avg_pct, 0)}` : undefined}
                table={{ columns: ['Status', 'Count'], rows: funnel.map(f => [STATUS[f.status] ?? f.status, f.count]) }}>
                <Donut centerValue={String(funnel.reduce((a, f) => a + f.count, 0))} centerLabel="homework"
                  data={funnel.map(f => ({ label: STATUS[f.status] ?? f.status, value: f.count, slot: STATUS_SLOT[f.status] }))} />
              </ChartCard>

              <ChartCard title="Still to hand in" empty={!todo.length} emptyText="Nothing waiting — all handed in."
                table={{ columns: ['Homework', 'Due', 'Status'], rows: todo.map(t => [t.title, t.due, t.overdue ? 'Overdue' : 'Due soon']) }}>
                <DataTable columns={['Homework', 'Due', 'Status']} rows={todo.map(t => [t.title, t.due, t.overdue ? 'Overdue' : 'Due soon'])} />
              </ChartCard>

              <ChartCard title="Quizzes" subtitle="Score compared with the class average" empty={!quizzes.length}
                table={{ columns: ['Quiz', 'Score %', 'Class average %'], rows: quizzes.map(q => [q.title, q.mine ?? '–', q.class ?? '–']) }}>
                <CompareBars horizontal domainMax={100} valueFormat={v => `${v}%`}
                  data={quizzes.map(q => ({ ...q, label: q.title.replace(/ – demo quiz/, '') }))} catKey="label"
                  series={[{ key: 'mine', label: isParent ? first : 'Me', slot: 0 }, { key: 'class', label: 'Class average', slot: 1 }]} />
              </ChartCard>
            </>
          )}

          {tab === 'fees' && fees && (
            <>
              <StatGrid min={150}>
                <Stat label="Billed" value={naira(fees.billed)} />
                <Stat label="Paid" value={naira(fees.paid)} sub={`${pct(paidPct, 0)} of billed`} />
                <Stat label="Balance" value={naira(fees.balance)} sub={fees.next_due ? `earliest due ${fees.next_due}` : undefined} />
              </StatGrid>

              <ChartCard title="Fees paid" insight={fees.overdue > 0 ? `${nairaFull(fees.overdue)} is past its due date` : fees.balance > 0 ? 'Balance is not yet due' : 'Fees are fully paid'}>
                <div role="img" aria-label={`${pct(paidPct, 0)} of fees paid`}>
                  <div style={{ height: 10, borderRadius: 5, background: 'var(--viz-grid)', overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, paidPct)}%`, height: '100%', background: 'var(--series-3)' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: 'var(--viz-ink-2)' }}>
                    <span>{nairaFull(fees.paid)} paid</span><span>{nairaFull(fees.billed)} billed</span>
                  </div>
                </div>
              </ChartCard>

              <ChartCard title="Payments made" empty={!(fees.history ?? []).length}
                table={{ columns: ['Month', 'Paid'], rows: (fees.history ?? []).map((h: any) => [monthLabel(h.month), nairaFull(h.amount)]) }}>
                <CompareBars data={(fees.history ?? []).map((h: any) => ({ ...h, label: monthLabel(h.month) }))} catKey="label"
                  series={[{ key: 'amount', label: 'Paid', slot: 2 }]} axisFormat={naira} valueFormat={nairaFull} />
              </ChartCard>
            </>
          )}

          <div style={{ height: 24 }} />
        </div>
      )}
    </ChartTheme>
  )
}
