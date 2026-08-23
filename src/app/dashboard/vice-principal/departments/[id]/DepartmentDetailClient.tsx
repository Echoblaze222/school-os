'use client'
// src/app/dashboard/vice-principal/departments/[id]/DepartmentDetailClient.tsx

import { useState } from 'react'
import RoleSubHeader from '@/components/RoleSubHeader'
import GaugeStat from '@/components/GaugeStat'
import { PlusIcon, XIcon, UserIcon, CheckCircleIcon, TrashIcon, ClockIcon, PeopleIcon, BookOpenIcon } from '@/components/Icons'
import { VP_FEATURE_GROUPS } from '../../featureGroups'
import type { Department } from '@/lib/supabase/appointments'
import type {
  DepartmentObjective, DepartmentTask, DepartmentReport, DepartmentScheduleItem, DepartmentPerformance,
} from '@/lib/supabase/departmentWork'
import styles from './detail.module.css'

interface Member { id: string; full_name: string; email: string; avatar_url: string | null; subjects_taught: string[] | null; employee_id: string | null }

interface Props {
  profile: any; school: any; userId: string
  department: Department
  canManage: boolean
  initialMembers: Member[]
  initialObjectives: DepartmentObjective[]
  initialTasks: DepartmentTask[]
  initialReports: DepartmentReport[]
  initialSchedule: DepartmentScheduleItem[]
  performance: DepartmentPerformance
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TABS = ['Overview', 'Objectives', 'Tasks', 'Reports', 'Schedule'] as const
type Tab = typeof TABS[number]

async function api(url: string, opts?: RequestInit) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opts })
  const json = await res.json()
  if (!json.ok) throw new Error(json.error ?? 'Something went wrong.')
  return json
}

export default function DepartmentDetailClient({
  profile, school, userId, department, canManage,
  initialMembers, initialObjectives, initialTasks, initialReports, initialSchedule, performance,
}: Props) {
  const [tab, setTab] = useState<Tab>('Overview')
  const [members] = useState(initialMembers)
  const [objectives, setObjectives] = useState(initialObjectives)
  const [tasks, setTasks] = useState(initialTasks)
  const [reports, setReports] = useState(initialReports)
  const [schedule, setSchedule] = useState(initialSchedule)
  const [error, setError] = useState('')

  const base = `/api/org/departments/${department.id}`

  // ── Objectives ──
  const [showObjForm, setShowObjForm] = useState(false)
  const [objTitle, setObjTitle] = useState(''); const [objDesc, setObjDesc] = useState(''); const [objDate, setObjDate] = useState('')
  async function addObjective() {
    if (!objTitle.trim()) return
    try {
      const { objective } = await api(`${base}/objectives`, { method: 'POST', body: JSON.stringify({ title: objTitle, description: objDesc, target_date: objDate || null }) })
      setObjectives(prev => [objective, ...prev]); setObjTitle(''); setObjDesc(''); setObjDate(''); setShowObjForm(false); setError('')
    } catch (e: any) { setError(e.message) }
  }
  async function cycleObjectiveStatus(o: DepartmentObjective) {
    const next = o.status === 'not_started' ? 'in_progress' : o.status === 'in_progress' ? 'completed' : 'not_started'
    try {
      await api(`${base}/objectives/${o.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
      setObjectives(prev => prev.map(x => x.id === o.id ? { ...x, status: next } : x))
    } catch (e: any) { setError(e.message) }
  }
  async function removeObjective(id: string) {
    if (!confirm('Delete this objective?')) return
    try { await api(`${base}/objectives/${id}`, { method: 'DELETE' }); setObjectives(prev => prev.filter(x => x.id !== id)) }
    catch (e: any) { setError(e.message) }
  }

  // ── Tasks ──
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [taskTitle, setTaskTitle] = useState(''); const [taskDue, setTaskDue] = useState('')
  async function addTask() {
    if (!taskTitle.trim()) return
    try {
      const { task } = await api(`${base}/tasks`, { method: 'POST', body: JSON.stringify({ title: taskTitle, due_date: taskDue || null }) })
      setTasks(prev => [task, ...prev]); setTaskTitle(''); setTaskDue(''); setShowTaskForm(false); setError('')
    } catch (e: any) { setError(e.message) }
  }
  async function cycleTaskStatus(t: DepartmentTask) {
    const next = t.status === 'todo' ? 'in_progress' : t.status === 'in_progress' ? 'done' : 'todo'
    try {
      await api(`${base}/tasks/${t.id}`, { method: 'PATCH', body: JSON.stringify({ status: next }) })
      setTasks(prev => prev.map(x => x.id === t.id ? { ...x, status: next } : x))
    } catch (e: any) { setError(e.message) }
  }
  async function removeTask(id: string) {
    if (!confirm('Delete this task?')) return
    try { await api(`${base}/tasks/${id}`, { method: 'DELETE' }); setTasks(prev => prev.filter(x => x.id !== id)) }
    catch (e: any) { setError(e.message) }
  }

  // ── Reports ──
  const [showReportForm, setShowReportForm] = useState(false)
  const [reportTitle, setReportTitle] = useState(''); const [reportBody, setReportBody] = useState(''); const [reportPeriod, setReportPeriod] = useState('')
  async function submitReport() {
    if (!reportTitle.trim() || !reportBody.trim()) return
    try {
      const { report } = await api(`${base}/reports`, { method: 'POST', body: JSON.stringify({ title: reportTitle, body: reportBody, period: reportPeriod }) })
      setReports(prev => [report, ...prev]); setReportTitle(''); setReportBody(''); setReportPeriod(''); setShowReportForm(false); setError('')
    } catch (e: any) { setError(e.message) }
  }
  async function acknowledge(id: string) {
    try {
      await api(`${base}/reports/${id}`, { method: 'PATCH' })
      setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'acknowledged' as const, acknowledged_at: new Date().toISOString() } : r))
    } catch (e: any) { setError(e.message) }
  }

  // ── Schedule ──
  const [showSchedForm, setShowSchedForm] = useState(false)
  const [schedTitle, setSchedTitle] = useState(''); const [schedDay, setSchedDay] = useState('1')
  const [schedStart, setSchedStart] = useState(''); const [schedEnd, setSchedEnd] = useState(''); const [schedLoc, setSchedLoc] = useState('')
  async function addSchedule() {
    if (!schedTitle.trim()) return
    try {
      const { item } = await api(`${base}/schedule`, { method: 'POST', body: JSON.stringify({ title: schedTitle, day_of_week: Number(schedDay), start_time: schedStart || null, end_time: schedEnd || null, location: schedLoc }) })
      setSchedule(prev => [...prev, item]); setSchedTitle(''); setSchedStart(''); setSchedEnd(''); setSchedLoc(''); setShowSchedForm(false); setError('')
    } catch (e: any) { setError(e.message) }
  }
  async function removeSchedule(id: string) {
    if (!confirm('Remove this schedule item?')) return
    try { await api(`${base}/schedule/${id}`, { method: 'DELETE' }); setSchedule(prev => prev.filter(x => x.id !== id)) }
    catch (e: any) { setError(e.message) }
  }

  return (
    <RoleSubHeader userId={userId} role="vice-principal" profile={profile} school={school} title={department.name} featureGroups={VP_FEATURE_GROUPS}>
      {department.description && <p className={styles.deptDescription}>{department.description}</p>}
      {!canManage && <div className={styles.readOnlyBanner}>Outside your assigned scope - you can view this department but not manage it.</div>}
      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.tabs}>
        {TABS.map(t => (
          <button key={t} className={`${styles.tabBtn} ${tab === t ? styles.tabBtnActive : ''}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>

      {tab === 'Overview' && (
        <>
          <div className={styles.perfRow}>
            <div className={`glass-card ${styles.perfCard}`}>
              {performance.averageScorePercent !== null ? (
                <GaugeStat label="Average score" value={performance.averageScorePercent} isPercent color="var(--status-ok, #3FA66B)" caption={`from ${performance.resultCount} results`} />
              ) : (
                <div className={styles.noPerf}>
                  <p className={styles.statLbl}>Average score</p>
                  <p className={styles.noPerfText}>{performance.subjectCount === 0 ? 'No subjects assigned to this department yet' : 'No results recorded for this department yet'}</p>
                </div>
              )}
            </div>
            <div className={`glass-card ${styles.perfCard}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <PeopleIcon size={14} color="var(--brand)" />
                <p className={styles.statLbl} style={{ margin: 0 }}>Members</p>
              </div>
              <p className={styles.statVal}>{members.length}</p>
            </div>
            <div className={`glass-card ${styles.perfCard}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <BookOpenIcon size={14} color="var(--brand)" />
                <p className={styles.statLbl} style={{ margin: 0 }}>Subjects</p>
              </div>
              <p className={styles.statVal}>{performance.subjectCount}</p>
            </div>
          </div>

          <p className={styles.sectionLabel}>Members</p>
          {members.length === 0 ? (
            <p className={styles.emptyLine}>No teachers assigned yet - add them from the Staff page.</p>
          ) : (
            <div className={styles.memberGrid}>
              {members.map(m => (
                <div key={m.id} className={styles.memberRow}>
                  <div className={styles.memberAvatar}>{m.avatar_url ? <img src={m.avatar_url} alt="" /> : <UserIcon size={14} />}</div>
                  <div>
                    <p className={styles.memberName}>{m.full_name}</p>
                    {m.subjects_taught && m.subjects_taught.length > 0 && <p className={styles.memberMeta}>{m.subjects_taught.slice(0, 3).join(', ')}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'Objectives' && (
        <>
          {canManage && <button className={styles.addBtn} onClick={() => setShowObjForm(true)}><PlusIcon size={13} /> New objective</button>}
          {objectives.length === 0 ? <p className={styles.emptyLine}>No objectives set for this department yet.</p> : (
            <div className={styles.list}>
              {objectives.map(o => (
                <div key={o.id} className={`glass-card ${styles.listRow}`}>
                  <button className={`${styles.statusChip} ${styles[`status_${o.status}`]}`} onClick={() => canManage && cycleObjectiveStatus(o)} disabled={!canManage}>
                    {o.status.replace('_', ' ')}
                  </button>
                  <div className={styles.listBody}>
                    <p className={styles.listTitle}>{o.title}</p>
                    {o.description && <p className={styles.listDesc}>{o.description}</p>}
                    {o.target_date && <p className={styles.listMeta}>Target: {new Date(o.target_date).toLocaleDateString()}</p>}
                  </div>
                  {canManage && <button className={styles.iconBtn} onClick={() => removeObjective(o.id)}><TrashIcon size={13} /></button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'Tasks' && (
        <>
          {canManage && <button className={styles.addBtn} onClick={() => setShowTaskForm(true)}><PlusIcon size={13} /> New task</button>}
          {tasks.length === 0 ? <p className={styles.emptyLine}>No tasks yet.</p> : (
            <div className={styles.list}>
              {tasks.map(t => (
                <div key={t.id} className={`glass-card ${styles.listRow}`}>
                  <button className={`${styles.statusChip} ${styles[`status_${t.status}`]}`} onClick={() => canManage && cycleTaskStatus(t)} disabled={!canManage}>
                    {t.status.replace('_', ' ')}
                  </button>
                  <div className={styles.listBody}>
                    <p className={styles.listTitle}>{t.title}</p>
                    <p className={styles.listMeta}>
                      {t.assignee?.full_name ?? 'Unassigned'}{t.due_date && ` · Due ${new Date(t.due_date).toLocaleDateString()}`}
                    </p>
                  </div>
                  {canManage && <button className={styles.iconBtn} onClick={() => removeTask(t.id)}><TrashIcon size={13} /></button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'Reports' && (
        <>
          {canManage && <button className={styles.addBtn} onClick={() => setShowReportForm(true)}><PlusIcon size={13} /> Submit report</button>}
          {reports.length === 0 ? <p className={styles.emptyLine}>No reports submitted yet.</p> : (
            <div className={styles.list}>
              {reports.map(r => (
                <div key={r.id} className={`glass-card ${styles.reportRow}`}>
                  <div className={styles.reportHeader}>
                    <p className={styles.listTitle}>{r.title}</p>
                    <span className={`${styles.reportBadge} ${r.status === 'acknowledged' ? styles.reportAck : ''}`}>
                      {r.status === 'acknowledged' ? <><CheckCircleIcon size={11} /> Acknowledged</> : <><ClockIcon size={11} /> Awaiting review</>}
                    </span>
                  </div>
                  <p className={styles.listDesc}>{r.body}</p>
                  <p className={styles.listMeta}>
                    {r.submitter?.full_name ?? 'Unknown'}{r.period && ` · ${r.period}`} · {new Date(r.created_at).toLocaleDateString()}
                  </p>
                  {canManage && r.status === 'submitted' && (
                    <button className={styles.ackBtn} onClick={() => acknowledge(r.id)}>Mark as acknowledged</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'Schedule' && (
        <>
          {canManage && <button className={styles.addBtn} onClick={() => setShowSchedForm(true)}><PlusIcon size={13} /> Add schedule item</button>}
          {schedule.length === 0 ? <p className={styles.emptyLine}>No recurring schedule set for this department.</p> : (
            <div className={styles.list}>
              {schedule.map(s => (
                <div key={s.id} className={`glass-card ${styles.listRow}`}>
                  <div className={styles.dayBadge}>{s.day_of_week !== null ? DAYS[s.day_of_week].slice(0, 3) : 'Once'}</div>
                  <div className={styles.listBody}>
                    <p className={styles.listTitle}>{s.title}</p>
                    <p className={styles.listMeta}>
                      {s.start_time && s.end_time ? `${s.start_time.slice(0, 5)} - ${s.end_time.slice(0, 5)}` : ''}{s.location && ` · ${s.location}`}
                    </p>
                  </div>
                  {canManage && <button className={styles.iconBtn} onClick={() => removeSchedule(s.id)}><TrashIcon size={13} /></button>}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Forms ── */}
      {showObjForm && (
        <div className={styles.overlay} onClick={() => setShowObjForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}><p className={styles.modalTitle}>New objective</p><button className={styles.closeBtn} onClick={() => setShowObjForm(false)}><XIcon size={16} /></button></div>
            <input className={styles.input} placeholder="e.g. Improve Term 2 average score" value={objTitle} onChange={e => setObjTitle(e.target.value)} autoFocus />
            <textarea className={styles.textarea} placeholder="Description (optional)" value={objDesc} onChange={e => setObjDesc(e.target.value)} rows={3} />
            <input className={styles.input} type="date" value={objDate} onChange={e => setObjDate(e.target.value)} />
            <button className={styles.primaryBtn} onClick={addObjective} disabled={!objTitle.trim()}>Create objective</button>
          </div>
        </div>
      )}

      {showTaskForm && (
        <div className={styles.overlay} onClick={() => setShowTaskForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}><p className={styles.modalTitle}>New task</p><button className={styles.closeBtn} onClick={() => setShowTaskForm(false)}><XIcon size={16} /></button></div>
            <input className={styles.input} placeholder="e.g. Submit scheme of work" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} autoFocus />
            <label className={styles.label}>Due date (optional)</label>
            <input className={styles.input} type="date" value={taskDue} onChange={e => setTaskDue(e.target.value)} />
            <button className={styles.primaryBtn} onClick={addTask} disabled={!taskTitle.trim()}>Create task</button>
          </div>
        </div>
      )}

      {showReportForm && (
        <div className={styles.overlay} onClick={() => setShowReportForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}><p className={styles.modalTitle}>Submit report</p><button className={styles.closeBtn} onClick={() => setShowReportForm(false)}><XIcon size={16} /></button></div>
            <input className={styles.input} placeholder="Title" value={reportTitle} onChange={e => setReportTitle(e.target.value)} autoFocus />
            <input className={styles.input} placeholder="Period, e.g. Term 2, 2026 (optional)" value={reportPeriod} onChange={e => setReportPeriod(e.target.value)} style={{ marginTop: 8 }} />
            <textarea className={styles.textarea} placeholder="Report content" value={reportBody} onChange={e => setReportBody(e.target.value)} rows={5} />
            <button className={styles.primaryBtn} onClick={submitReport} disabled={!reportTitle.trim() || !reportBody.trim()}>Submit</button>
          </div>
        </div>
      )}

      {showSchedForm && (
        <div className={styles.overlay} onClick={() => setShowSchedForm(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}><p className={styles.modalTitle}>New schedule item</p><button className={styles.closeBtn} onClick={() => setShowSchedForm(false)}><XIcon size={16} /></button></div>
            <input className={styles.input} placeholder="e.g. Department meeting" value={schedTitle} onChange={e => setSchedTitle(e.target.value)} autoFocus />
            <label className={styles.label}>Day</label>
            <select className={styles.input} value={schedDay} onChange={e => setSchedDay(e.target.value)}>
              {DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
            </select>
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input className={styles.input} type="time" value={schedStart} onChange={e => setSchedStart(e.target.value)} />
              <input className={styles.input} type="time" value={schedEnd} onChange={e => setSchedEnd(e.target.value)} />
            </div>
            <input className={styles.input} placeholder="Location (optional)" value={schedLoc} onChange={e => setSchedLoc(e.target.value)} style={{ marginTop: 8 }} />
            <button className={styles.primaryBtn} onClick={addSchedule} disabled={!schedTitle.trim()}>Add to schedule</button>
          </div>
        </div>
      )}

      <div style={{ height: 40 }} />
    </RoleSubHeader>
  )
}
