// src/app/dashboard/teacher/grades/page.tsx
// Pure client component — assignments + quiz attempts in one page.

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import RolePageWrapper from '@/components/RolePageWrapper'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Submission {
  id: string; student_id: string; student_name: string
  assignment_id: string; assignment_title: string
  class_name: string; subject_name: string
  submitted_at: string; file_url: string | null
  text_response: string | null; score: number | null
  max_score: number; feedback: string | null; status: string
}
interface AssignmentGroup {
  assignment_id: string; title: string; class_name: string
  subject_name: string; due_date: string | null
  max_score: number; pending_count: number; graded_count: number
}
interface QuizAttempt {
  id: string; quiz_id: string; student_id: string
  student_name: string; quiz_title: string; class_name: string
  score: number; max_score: number; submitted_at: string
  pct: number
}
interface QuizGroup {
  quiz_id: string; title: string; class_name: string
  total_marks: number; attempt_count: number; avg_score: number
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function initials(n: string) { return n.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() }
function relTime(iso: string) {
  const d = Date.now() - new Date(iso).getTime(), m = Math.floor(d/60000)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m/60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}
function gradeInfo(score: number, max: number) {
  const p = max > 0 ? (score/max)*100 : 0
  if (p >= 75) return { g:'A', c:'#10B981' }
  if (p >= 65) return { g:'B', c:'#3B82F6' }
  if (p >= 50) return { g:'C', c:'#F59E0B' }
  if (p >= 40) return { g:'D', c:'#F97316' }
  return { g:'F', c:'#EF4444' }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function GradeSubmissionsPage() {
  const [userId,   setUserId]   = useState<string|null>(null)
  const [profile,  setProfile]  = useState<any>(null)
  const [school,   setSchool]   = useState<any>(null)
  const [loading,  setLoading]  = useState(true)
  const [debugLog, setDebugLog] = useState<string[]>([])
  const [fetchErr, setFetchErr] = useState<string|null>(null)

  // Tab: 'assignments' | 'quizzes'
  const [mainTab, setMainTab] = useState<'assignments'|'quizzes'>('assignments')

  // Assignment state
  const [submissions,      setSubmissions]      = useState<Submission[]>([])
  const [assignmentGroups, setAssignmentGroups] = useState<AssignmentGroup[]>([])
  const [selectedAsgId,    setSelectedAsgId]    = useState<string|null>(null)
  const [filterTab,        setFilterTab]        = useState<'pending'|'graded'|'all'>('pending')
  const [scoreInputs,      setScoreInputs]      = useState<Record<string,string>>({})
  const [feedbackInputs,   setFeedbackInputs]   = useState<Record<string,string>>({})
  const [savingIds,        setSavingIds]        = useState<Set<string>>(new Set())

  // Quiz state
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>([])
  const [quizGroups,   setQuizGroups]   = useState<QuizGroup[]>([])
  const [selectedQId,  setSelectedQId]  = useState<string|null>(null)

  const supabase = createClient()
  function log(msg: string) { console.log('[grades]', msg); setDebugLog(p => [...p, msg]) }

  useEffect(() => { init() }, [])

  async function init() {
    setLoading(true); setDebugLog([]); setFetchErr(null)

    // ── Auth ──────────────────────────────────────────────────
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) { setFetchErr(`Auth: ${authErr?.message ?? 'no user'}`); setLoading(false); return }
    setUserId(user.id)
    log(`uid: ${user.id}`)

    // ── Profile ───────────────────────────────────────────────
    const { data: prof, error: profErr } = await supabase
      .from('profiles').select('*, schools(*)').eq('id', user.id).single()
    if (profErr) { setFetchErr(`Profile: ${profErr.message}`); setLoading(false); return }
    setProfile(prof)
    const sc = (prof as any)?.schools ?? null
    setSchool(sc)
    log(`school: ${sc?.id ?? 'NULL'}`)

    // ── Assignments ───────────────────────────────────────────
    const [r1, r2, r3] = await Promise.all([
      supabase.from('assignments').select('id,title,class_id,due_date,max_score,subject,classes(name)').eq('school_id', sc?.id).eq('posted_by', user.id),
      supabase.from('assignments').select('id,title,class_id,due_date,max_score,subject,classes(name)').eq('school_id', sc?.id).eq('teacher_id', user.id),
      supabase.from('assignments').select('id,title,class_id,due_date,max_score,subject,classes(name)').eq('school_id', sc?.id).eq('created_by', user.id),
    ])
    log(`asg posted_by:${r1.data?.length??0} teacher_id:${r2.data?.length??0} created_by:${r3.data?.length??0}`)

    const asgMap: Record<string,any> = {}
    for (const row of [...(r1.data??[]),...(r2.data??[]),...(r3.data??[])]) asgMap[row.id] = row
    const allAsg = Object.values(asgMap)
    const asgIds = allAsg.map((a:any) => a.id)
    log(`assignments: ${allAsg.length}`)

    if (asgIds.length > 0) {
      const { data: subs, error: subErr } = await supabase
        .from('assignment_submissions')
        .select('id,student_id,assignment_id,submitted_at,file_url,text_response,answer_text,score,feedback,status')
        .in('assignment_id', asgIds)
        .not('submitted_at','is',null)
        .order('submitted_at', { ascending: false })
      log(`submissions:${subs?.length??0} ${subErr?.message??'ok'}`)
      if (subErr) setFetchErr(`Submissions: ${subErr.message}`)

      // Student names
      const studIds = [...new Set((subs??[]).map((s:any) => s.student_id))]
      const nameMap: Record<string,string> = {}
      if (studIds.length > 0) {
        const { data: profs } = await supabase.from('profiles').select('id,full_name').in('id', studIds)
        ;(profs??[]).forEach((p:any) => { nameMap[p.id] = p.full_name ?? 'Unknown' })
      }

      const shaped: Submission[] = (subs??[]).map((s:any) => {
        const a = asgMap[s.assignment_id]
        return {
          id: s.id, student_id: s.student_id,
          student_name: nameMap[s.student_id] ?? 'Unknown',
          assignment_id: s.assignment_id,
          assignment_title: a?.title ?? 'Assignment',
          class_name: a?.classes?.name ?? a?.subject ?? '—',
          subject_name: a?.subject ?? '—',
          submitted_at: s.submitted_at,
          file_url: s.file_url ?? null,
          text_response: s.text_response ?? s.answer_text ?? null,
          score: s.score ?? null, max_score: a?.max_score ?? 100,
          feedback: s.feedback ?? null, status: s.status ?? 'submitted',
        }
      })
      setSubmissions(shaped)

      const groupMap: Record<string,AssignmentGroup> = {}
      allAsg.forEach((a:any) => {
        groupMap[a.id] = { assignment_id:a.id, title:a.title, class_name:a.classes?.name??a.subject??'—', subject_name:a.subject??'—', due_date:a.due_date??null, max_score:a.max_score??100, pending_count:0, graded_count:0 }
      })
      shaped.forEach(s => {
        if (!groupMap[s.assignment_id]) return
        if (s.status !== 'graded') groupMap[s.assignment_id].pending_count++
        else groupMap[s.assignment_id].graded_count++
      })
      const groups = Object.values(groupMap).filter(g => g.pending_count+g.graded_count > 0).sort((a,b) => b.pending_count-a.pending_count)
      log(`assignment groups with submissions: ${groups.length}`)
      setAssignmentGroups(groups)
      if (groups[0]) setSelectedAsgId(groups[0].assignment_id)
    }

    // ── Quizzes ───────────────────────────────────────────────
    const { data: myQuizzes, error: qErr } = await supabase
      .from('quizzes')
      .select('id,title,total_marks,class_id,classes(name)')
      .eq('school_id', sc?.id)
      .or(`created_by.eq.${user.id},teacher_id.eq.${user.id}`)
    log(`quizzes:${myQuizzes?.length??0} ${qErr?.message??'ok'}`)

    const quizMap: Record<string,any> = {}
    ;(myQuizzes??[]).forEach((q:any) => { quizMap[q.id] = q })
    const quizIds = Object.keys(quizMap)

    if (quizIds.length > 0) {
      const { data: attempts, error: aErr } = await supabase
        .from('quiz_attempts')
        .select('id,quiz_id,student_id,score,max_score,submitted_at')
        .in('quiz_id', quizIds)
        .not('submitted_at','is',null)
        .order('submitted_at', { ascending: false })
      log(`quiz attempts:${attempts?.length??0} ${aErr?.message??'ok'}`)

      // Student names for quiz attempts
      const qStudIds = [...new Set((attempts??[]).map((a:any) => a.student_id))]
      const qNameMap: Record<string,string> = {}
      if (qStudIds.length > 0) {
        const { data: qProfs } = await supabase.from('profiles').select('id,full_name').in('id', qStudIds)
        ;(qProfs??[]).forEach((p:any) => { qNameMap[p.id] = p.full_name ?? 'Unknown' })
      }

      const shapedAttempts: QuizAttempt[] = (attempts??[]).map((a:any) => {
        const q = quizMap[a.quiz_id]
        const mx = a.max_score ?? q?.total_marks ?? 100
        const sc2 = a.score ?? 0
        return {
          id: a.id, quiz_id: a.quiz_id,
          student_id: a.student_id,
          student_name: qNameMap[a.student_id] ?? 'Unknown',
          quiz_title: q?.title ?? 'Quiz',
          class_name: q?.classes?.name ?? '—',
          score: sc2, max_score: mx,
          submitted_at: a.submitted_at,
          pct: mx > 0 ? Math.round((sc2/mx)*100) : 0,
        }
      })
      setQuizAttempts(shapedAttempts)

      // Group by quiz
      const qGroupMap: Record<string,QuizGroup> = {}
      ;(myQuizzes??[]).forEach((q:any) => {
        qGroupMap[q.id] = { quiz_id:q.id, title:q.title, class_name:q.classes?.name??'—', total_marks:q.total_marks??100, attempt_count:0, avg_score:0 }
      })
      const scoreSums: Record<string,number> = {}
      shapedAttempts.forEach(a => {
        if (!qGroupMap[a.quiz_id]) return
        qGroupMap[a.quiz_id].attempt_count++
        scoreSums[a.quiz_id] = (scoreSums[a.quiz_id]??0) + a.pct
      })
      Object.keys(qGroupMap).forEach(id => {
        const g = qGroupMap[id]
        g.avg_score = g.attempt_count > 0 ? Math.round(scoreSums[id]/g.attempt_count) : 0
      })
      const qGroups = Object.values(qGroupMap).filter(g => g.attempt_count > 0).sort((a,b) => b.attempt_count-a.attempt_count)
      log(`quiz groups with attempts: ${qGroups.length}`)
      setQuizGroups(qGroups)
      if (qGroups[0]) setSelectedQId(qGroups[0].quiz_id)
    }

    setLoading(false)
  }

  async function saveGrade(sub: Submission) {
    const scoreStr = scoreInputs[sub.id]; if (!scoreStr && scoreStr !== '0') return
    const scoreVal = Math.min(Math.max(Number(scoreStr),0), sub.max_score)
    const fb = feedbackInputs[sub.id] ?? ''
    setSavingIds(p => new Set(p).add(sub.id))
    const { error } = await supabase.from('assignment_submissions')
      .update({ score:scoreVal, feedback:fb||null, status:'graded', graded_at:new Date().toISOString(), graded_by:userId })
      .eq('id', sub.id)
    setSavingIds(p => { const n=new Set(p); n.delete(sub.id); return n })
    if (!error) {
      setSubmissions(p => p.map(s => s.id===sub.id ? {...s,score:scoreVal,feedback:fb||null,status:'graded'} : s))
      setAssignmentGroups(p => p.map(g => g.assignment_id!==sub.assignment_id ? g : {...g,pending_count:Math.max(0,g.pending_count-1),graded_count:g.graded_count+1}))
      setScoreInputs(p => { const n={...p}; delete n[sub.id]; return n })
      setFeedbackInputs(p => { const n={...p}; delete n[sub.id]; return n })
    }
  }

  const color = school?.primary_color ?? '#7C3AED'
  const selectedAsgGrp = assignmentGroups.find(g => g.assignment_id === selectedAsgId)
  const visibleSubs = submissions.filter(s => {
    if (s.assignment_id !== selectedAsgId) return false
    if (filterTab === 'pending') return s.status !== 'graded'
    if (filterTab === 'graded') return s.status === 'graded'
    return true
  })
  const selectedQGrp  = quizGroups.find(g => g.quiz_id === selectedQId)
  const visibleAttempts = quizAttempts.filter(a => a.quiz_id === selectedQId)

  const totalPending = assignmentGroups.reduce((s,g) => s+g.pending_count, 0)
  const totalQuizAttempts = quizGroups.reduce((s,g) => s+g.attempt_count, 0)

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{display:'flex',alignItems:'center',justifyContent:'center',minHeight:'100dvh',background:'var(--bg-base)',flexDirection:'column',gap:16}}>
      <div style={{display:'flex',gap:6}}>{[0,1,2].map(i=><span key={i} style={{width:8,height:8,borderRadius:'50%',background:color,opacity:0.5}}/>)}</div>
      <p style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>Loading grades...</p>
    </div>
  )

  // ── Empty with debug log ───────────────────────────────────────────────────
  if (assignmentGroups.length === 0 && quizGroups.length === 0) return (
    <div style={{padding:24,minHeight:'100dvh',background:'var(--bg-base)'}}>
      <p style={{fontWeight:700,color:'var(--text-primary)',fontSize:'1rem',marginBottom:4}}>Grade Submissions</p>
      <p style={{fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:20}}>No submissions found yet.</p>
      <div style={{background:'#0d0d0d',border:'1px solid #2a2a2a',borderRadius:12,padding:16}}>
        <p style={{fontSize:'0.65rem',fontWeight:800,color:'#F59E0B',margin:'0 0 10px',textTransform:'uppercase',letterSpacing:'0.08em'}}>📋 Debug Log</p>
        {debugLog.map((l,i)=><p key={i} style={{margin:'3px 0',fontSize:'0.75rem',color:'#10B981',fontFamily:'monospace'}}>{l}</p>)}
        {fetchErr&&<p style={{margin:'6px 0 0',fontSize:'0.75rem',color:'#EF4444',fontFamily:'monospace'}}>ERR: {fetchErr}</p>}
      </div>
    </div>
  )

  // ── Main UI ────────────────────────────────────────────────────────────────
  return (
    <RolePageWrapper userId={userId!} role="teacher" profile={profile} school={school} title="Grade Submissions">

      {fetchErr&&<div style={{padding:'8px 14px',background:'#EF444415',border:'1px solid #EF444430',borderRadius:8,marginBottom:16,fontSize:'0.75rem',color:'#EF4444'}}>⚠️ {fetchErr}</div>}

      {/* ── Main tab switcher ── */}
      <div style={{display:'flex',gap:8,marginBottom:20}}>
        <button onClick={()=>setMainTab('assignments')}
          style={{flex:1,padding:'10px 0',borderRadius:10,fontWeight:700,fontSize:'0.82rem',cursor:'pointer',border:`1.5px solid ${mainTab==='assignments'?color:'var(--glass-border)'}`,background:mainTab==='assignments'?color+'18':'var(--glass-bg)',color:mainTab==='assignments'?color:'var(--text-muted)'}}>
          📋 Assignments
          {totalPending>0&&<span style={{marginLeft:6,padding:'1px 6px',borderRadius:999,background:'#EF4444',color:'#fff',fontSize:'0.65rem',fontWeight:800}}>{totalPending}</span>}
        </button>
        <button onClick={()=>setMainTab('quizzes')}
          style={{flex:1,padding:'10px 0',borderRadius:10,fontWeight:700,fontSize:'0.82rem',cursor:'pointer',border:`1.5px solid ${mainTab==='quizzes'?color:'var(--glass-border)'}`,background:mainTab==='quizzes'?color+'18':'var(--glass-bg)',color:mainTab==='quizzes'?color:'var(--text-muted)'}}>
          🏆 Quizzes
          {totalQuizAttempts>0&&<span style={{marginLeft:6,padding:'1px 6px',borderRadius:999,background:color,color:'#fff',fontSize:'0.65rem',fontWeight:800}}>{totalQuizAttempts}</span>}
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════
          ASSIGNMENTS TAB
      ══════════════════════════════════════════════════════ */}
      {mainTab==='assignments'&&(
        <>
          {assignmentGroups.length===0
            ? <div style={{textAlign:'center' as const,padding:'40px 0',color:'var(--text-muted)'}}>No assignment submissions yet.</div>
            : <>
                <p style={{fontSize:'0.65rem',fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase' as const,color:'var(--text-muted)',margin:'0 0 10px'}}>
                  Assignments ({assignmentGroups.length})
                </p>
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:20}}>
                  {assignmentGroups.map(g=>(
                    <button key={g.assignment_id} onClick={()=>{setSelectedAsgId(g.assignment_id);setFilterTab('pending')}}
                      style={{textAlign:'left' as const,padding:'10px 14px',background:selectedAsgId===g.assignment_id?color+'18':'var(--glass-bg)',border:`1px solid ${selectedAsgId===g.assignment_id?color+'60':'var(--glass-border)'}`,borderRadius:10,cursor:'pointer',width:'100%'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{margin:'0 0 2px',fontWeight:700,fontSize:'0.88rem',color:selectedAsgId===g.assignment_id?color:'var(--text-primary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.title}</p>
                          <p style={{margin:0,color:'var(--text-muted)',fontSize:'0.7rem'}}>{g.class_name} · {g.max_score}pts</p>
                        </div>
                        <div style={{display:'flex',gap:5,flexShrink:0,marginLeft:8}}>
                          {g.pending_count>0&&<span style={{padding:'2px 8px',borderRadius:999,background:'#EF444420',color:'#EF4444',fontSize:'0.68rem',fontWeight:800}}>{g.pending_count} pending</span>}
                          {g.graded_count>0&&<span style={{padding:'2px 8px',borderRadius:999,background:'#10B98120',color:'#10B981',fontSize:'0.68rem',fontWeight:800}}>{g.graded_count} graded</span>}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedAsgGrp&&(
                  <>
                    <div style={{display:'flex',gap:6,marginBottom:16}}>
                      {(['pending','graded','all'] as const).map(t=>(
                        <button key={t} onClick={()=>setFilterTab(t)}
                          style={{padding:'6px 12px',borderRadius:999,background:filterTab===t?color:'var(--glass-bg)',border:`1px solid ${filterTab===t?color:'var(--glass-border)'}`,color:filterTab===t?'#fff':'var(--text-muted)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer'}}>
                          {t==='pending'?`Needs Grading (${selectedAsgGrp.pending_count})`:t==='graded'?`Graded (${selectedAsgGrp.graded_count})`:'All'}
                        </button>
                      ))}
                    </div>

                    {visibleSubs.length===0
                      ? <div style={{textAlign:'center' as const,padding:'28px 0',color:'var(--text-muted)'}}>{filterTab==='pending'?'✅ All caught up!':'No submissions here.'}</div>
                      : <div style={{display:'flex',flexDirection:'column',gap:10}}>
                          {visibleSubs.map(sub=>{
                            const isGraded=sub.status==='graded', isSaving=savingIds.has(sub.id)
                            const scoreStr=scoreInputs[sub.id]??(sub.score!==null?String(sub.score):'')
                            const gr=scoreStr!==''?gradeInfo(Number(scoreStr),sub.max_score):null
                            const editing=scoreInputs[sub.id]!==undefined
                            return (
                              <div key={sub.id} style={{padding:14,background:'var(--glass-bg)',border:`1px solid ${isGraded&&!editing?'#10B98130':'var(--glass-border)'}`,borderRadius:12}}>
                                <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:10}}>
                                  <div style={{width:36,height:36,borderRadius:'50%',background:color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color,fontSize:'0.8rem',flexShrink:0}}>{initials(sub.student_name)}</div>
                                  <div style={{flex:1}}>
                                    <p style={{margin:'0 0 1px',fontWeight:700,color:'var(--text-primary)',fontSize:'0.88rem'}}>{sub.student_name}</p>
                                    <p style={{margin:0,color:'var(--text-muted)',fontSize:'0.7rem'}}>Submitted {relTime(sub.submitted_at)}{sub.status==='late'&&<span style={{color:'#F97316',fontWeight:700,marginLeft:4}}>· Late</span>}</p>
                                  </div>
                                  {isGraded&&!editing&&(
                                    <div style={{textAlign:'right' as const}}>
                                      <span style={{fontSize:'1.1rem',fontWeight:800,color:gradeInfo(sub.score!,sub.max_score).c}}>{sub.score}/{sub.max_score}</span>
                                      <span style={{marginLeft:6,padding:'2px 7px',borderRadius:4,background:gradeInfo(sub.score!,sub.max_score).c+'20',color:gradeInfo(sub.score!,sub.max_score).c,fontSize:'0.72rem',fontWeight:800}}>{gradeInfo(sub.score!,sub.max_score).g}</span>
                                    </div>
                                  )}
                                </div>
                                {sub.text_response&&<div style={{margin:'0 0 8px',background:'rgba(255,255,255,0.03)',border:'1px solid var(--glass-border)',borderRadius:8,padding:'8px 12px'}}><p style={{fontSize:'0.62rem',fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase' as const,letterSpacing:'0.06em',margin:'0 0 4px'}}>Student's Answer</p><p style={{margin:0,fontSize:'0.8rem',color:'var(--text-secondary)',lineHeight:1.5}}>{sub.text_response}</p></div>}
                                {sub.file_url&&<a href={sub.file_url} target="_blank" rel="noopener noreferrer" style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:'0.75rem',fontWeight:600,color,marginBottom:8,textDecoration:'none'}}>📎 View Submission →</a>}
                                {isGraded&&!editing&&sub.feedback&&<div style={{margin:'0 0 8px',background:color+'10',border:`1px solid ${color}30`,borderRadius:8,padding:'8px 12px'}}><p style={{fontSize:'0.62rem',fontWeight:700,color,textTransform:'uppercase' as const,letterSpacing:'0.06em',margin:'0 0 4px'}}>Your Feedback</p><p style={{margin:0,fontSize:'0.8rem',color:'var(--text-secondary)',lineHeight:1.5}}>{sub.feedback}</p></div>}
                                {(!isGraded||editing)&&(
                                  <div style={{display:'flex',flexDirection:'column',gap:8}}>
                                    <div style={{display:'flex',alignItems:'center',gap:8}}>
                                      <input type="number" min={0} max={sub.max_score} placeholder={`0–${sub.max_score}`} value={scoreStr} onChange={e=>setScoreInputs(p=>({...p,[sub.id]:e.target.value}))} style={{width:90,height:38,padding:'0 10px',background:'var(--input-bg)',border:`1px solid ${color}60`,borderRadius:8,color:'var(--text-primary)',fontSize:'0.9rem',fontWeight:700,outline:'none'}}/>
                                      <span style={{color:'var(--text-muted)',fontSize:'0.82rem'}}>/ {sub.max_score}</span>
                                      {gr&&<span style={{padding:'3px 10px',borderRadius:6,background:gr.c+'20',color:gr.c,fontSize:'0.8rem',fontWeight:800}}>{gr.g}</span>}
                                    </div>
                                    <textarea placeholder="Feedback (optional)..." value={feedbackInputs[sub.id]??sub.feedback??''} onChange={e=>setFeedbackInputs(p=>({...p,[sub.id]:e.target.value}))} rows={2} style={{width:'100%',padding:'8px 12px',background:'var(--input-bg)',border:'1px solid var(--input-border)',borderRadius:8,color:'var(--text-primary)',fontSize:'0.82rem',outline:'none',resize:'vertical',boxSizing:'border-box' as const}}/>
                                    <div style={{display:'flex',gap:6}}>
                                      <button onClick={()=>saveGrade(sub)} disabled={isSaving||scoreStr===''} style={{flex:1,height:38,background:scoreStr!==''?color:'var(--glass-bg)',color:scoreStr!==''?'#fff':'var(--text-muted)',border:'none',borderRadius:8,fontWeight:700,fontSize:'0.82rem',cursor:scoreStr!==''?'pointer':'default',opacity:isSaving?0.6:1}}>{isSaving?'Saving...':isGraded?'✏️ Update':'Save Grade'}</button>
                                      {editing&&<button onClick={()=>{setScoreInputs(p=>{const n={...p};delete n[sub.id];return n});setFeedbackInputs(p=>{const n={...p};delete n[sub.id];return n})}} style={{height:38,padding:'0 12px',background:'transparent',border:'1px solid var(--glass-border)',borderRadius:8,color:'var(--text-muted)',fontSize:'0.78rem',cursor:'pointer'}}>Cancel</button>}
                                    </div>
                                  </div>
                                )}
                                {isGraded&&!editing&&<button onClick={()=>{setScoreInputs(p=>({...p,[sub.id]:String(sub.score??'')}));setFeedbackInputs(p=>({...p,[sub.id]:sub.feedback??''}))}} style={{marginTop:4,fontSize:'0.7rem',fontWeight:700,color,background:'none',border:'none',cursor:'pointer',padding:0}}>Edit grade</button>}
                              </div>
                            )
                          })}
                        </div>
                    }
                  </>
                )}
              </>
          }
        </>
      )}

      {/* ══════════════════════════════════════════════════════
          QUIZZES TAB
      ══════════════════════════════════════════════════════ */}
      {mainTab==='quizzes'&&(
        <>
          {quizGroups.length===0
            ? <div style={{textAlign:'center' as const,padding:'40px 0',color:'var(--text-muted)'}}>No quiz attempts yet.</div>
            : <>
                <p style={{fontSize:'0.65rem',fontWeight:800,letterSpacing:'0.1em',textTransform:'uppercase' as const,color:'var(--text-muted)',margin:'0 0 10px'}}>
                  Quizzes ({quizGroups.length})
                </p>
                <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:20}}>
                  {quizGroups.map(g=>(
                    <button key={g.quiz_id} onClick={()=>setSelectedQId(g.quiz_id)}
                      style={{textAlign:'left' as const,padding:'10px 14px',background:selectedQId===g.quiz_id?color+'18':'var(--glass-bg)',border:`1px solid ${selectedQId===g.quiz_id?color+'60':'var(--glass-border)'}`,borderRadius:10,cursor:'pointer',width:'100%'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <p style={{margin:'0 0 2px',fontWeight:700,fontSize:'0.88rem',color:selectedQId===g.quiz_id?color:'var(--text-primary)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{g.title}</p>
                          <p style={{margin:0,color:'var(--text-muted)',fontSize:'0.7rem'}}>{g.class_name} · {g.total_marks}pts · avg {g.avg_score}%</p>
                        </div>
                        <span style={{padding:'2px 8px',borderRadius:999,background:color+'20',color,fontSize:'0.68rem',fontWeight:800,flexShrink:0,marginLeft:8}}>{g.attempt_count} attempt{g.attempt_count!==1?'s':''}</span>
                      </div>
                    </button>
                  ))}
                </div>

                {selectedQGrp&&(
                  <>
                    {/* Quiz summary stats */}
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:16}}>
                      {[
                        { label:'Attempts', val: selectedQGrp.attempt_count },
                        { label:'Avg Score', val: `${selectedQGrp.avg_score}%` },
                        { label:'Max Marks', val: selectedQGrp.total_marks },
                      ].map(s=>(
                        <div key={s.label} style={{background:'var(--glass-bg)',border:'1px solid var(--glass-border)',borderRadius:10,padding:'10px 12px',textAlign:'center' as const}}>
                          <p style={{margin:'0 0 2px',fontSize:'1rem',fontWeight:800,color}}>{s.val}</p>
                          <p style={{margin:0,fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase' as const,letterSpacing:'0.05em'}}>{s.label}</p>
                        </div>
                      ))}
                    </div>

                    {/* Individual attempts — read-only, auto-scored */}
                    <p style={{fontSize:'0.65rem',fontWeight:800,color:'var(--text-muted)',textTransform:'uppercase' as const,letterSpacing:'0.08em',margin:'0 0 10px'}}>
                      Student Results
                    </p>
                    <div style={{display:'flex',flexDirection:'column',gap:8}}>
                      {visibleAttempts.map(a=>{
                        const gi = gradeInfo(a.score, a.max_score)
                        return (
                          <div key={a.id} style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px',background:'var(--glass-bg)',border:'1px solid var(--glass-border)',borderRadius:12}}>
                            <div style={{width:36,height:36,borderRadius:'50%',background:color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:800,color,fontSize:'0.8rem',flexShrink:0}}>{initials(a.student_name)}</div>
                            <div style={{flex:1,minWidth:0}}>
                              <p style={{margin:'0 0 2px',fontWeight:700,color:'var(--text-primary)',fontSize:'0.88rem'}}>{a.student_name}</p>
                              <p style={{margin:0,color:'var(--text-muted)',fontSize:'0.7rem'}}>Submitted {relTime(a.submitted_at)}</p>
                            </div>
                            <div style={{textAlign:'right' as const,flexShrink:0}}>
                              <p style={{margin:'0 0 2px',fontSize:'1rem',fontWeight:800,color:gi.c}}>{a.pct}%</p>
                              <p style={{margin:0,fontSize:'0.7rem',color:'var(--text-muted)'}}>{a.score}/{a.max_score}</p>
                            </div>
                            <span style={{padding:'3px 9px',borderRadius:6,background:gi.c+'20',color:gi.c,fontSize:'0.75rem',fontWeight:800,flexShrink:0}}>{gi.g}</span>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
              </>
          }
        </>
      )}

      <div style={{height:100}}/>
    </RolePageWrapper>
  )
}
