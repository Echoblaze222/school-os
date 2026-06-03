'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { ClassOption } from './page'
import styles from './codes.module.css'

interface Props { classOptions: ClassOption[]; schoolId: string; secretaryId: string; backHref?: string }

type UserRole = 'student'|'teacher'|'bursar'|'secretary'|'parent'
const ROLES: {value:UserRole;label:string}[] = [
  {value:'student',label:'Student'},{value:'teacher',label:'Teacher'},
  {value:'bursar',label:'Bursar'},{value:'secretary',label:'Secretary'},{value:'parent',label:'Parent'},
]

interface GeneratedCode { code: string; name: string; email: string; role: UserRole; created_at: string }

const IconSun=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconChevronLeft=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M15 18l-6-6 6-6"/></svg>
const IconCopy=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>

export default function CodesClient({ classOptions, schoolId, secretaryId, backHref }: Props) {
  const [isDark,setIsDark]=useState(true); const [mounted,setMounted]=useState(false)
  const [fullName,setFullName]=useState('')
  const [email,setEmail]=useState('')
  const [role,setRole]=useState<UserRole>('student')
  const [classId,setClassId]=useState('')
  const [generating,setGenerating]=useState(false)
  const [generated,setGenerated]=useState<GeneratedCode|null>(null)
  const [error,setError]=useState('')
  const [history,setHistory]=useState<GeneratedCode[]>([])
  const [copied,setCopied]=useState(false)

  useEffect(()=>{ const s=localStorage.getItem('schoolos_theme'); const dark=s!=='light'; setIsDark(dark); document.documentElement.setAttribute('data-theme',dark?'dark':'light'); setMounted(true) },[])
  const toggleTheme=()=>{ const n=!isDark; setIsDark(n); document.documentElement.setAttribute('data-theme',n?'dark':'light'); localStorage.setItem('schoolos_theme',n?'dark':'light') }

  async function handleGenerate() {
    if (!fullName.trim()||!email.trim()) return
    setGenerating(true); setError(''); setGenerated(null)

    try {
      // Call server action / API route for admin user creation
      const res = await fetch('/api/secretary/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim().toLowerCase(), role, classId: classId||null, schoolId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to create user')
      const entry: GeneratedCode = { code: data.code, name: fullName.trim(), email: email.trim().toLowerCase(), role, created_at: new Date().toISOString() }
      setGenerated(entry)
      setHistory(p=>[entry,...p])
      setFullName(''); setEmail(''); setClassId('')
    } catch (e: any) {
      setError(e.message)
    }
    setGenerating(false)
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).catch(()=>{})
    setCopied(true); setTimeout(()=>setCopied(false),2000)
  }

  if (!mounted) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href={backHref ?? '/dashboard/secretary/users'} className={styles.backBtn}><IconChevronLeft /> {backHref ? 'Dashboard' : 'Users'}</Link>
          <h1 className={styles.pageTitle}>Generate <span>Access Codes</span></h1>
        </div>
        <button className={styles.themeBtn} onClick={toggleTheme}>{isDark?<IconSun />:<IconMoon />}</button>
      </header>

      <div className={styles.body}>
        {/* Form */}
        <div className={styles.formCard}>
          <div className={styles.formHeader}><p className={styles.formTitle}>Create New User</p><p className={styles.formSub}>Code format: SCH-YYYY-XXXX</p></div>
          <div className={styles.formBody}>
            {error&&<div className={styles.errorMsg}>{error}</div>}
            <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Full Name *</label><input className={styles.fieldInput} placeholder="e.g. Amara Osei" value={fullName} onChange={e=>setFullName(e.target.value)} /></div>
            <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Email Address *</label><input type="email" className={styles.fieldInput} placeholder="user@school.edu.ng" value={email} onChange={e=>setEmail(e.target.value)} /></div>
            <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Role *</label>
              <select className={`${styles.fieldInput} ${styles.fieldSelect}`} value={role} onChange={e=>setRole(e.target.value as UserRole)}>
                {ROLES.map(r=><option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {role==='student'&&(
              <div className={styles.fieldGroup}><label className={styles.fieldLabel}>Assign Class</label>
                <select className={`${styles.fieldInput} ${styles.fieldSelect}`} value={classId} onChange={e=>setClassId(e.target.value)}>
                  <option value="">Select class…</option>
                  {classOptions.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <button className={styles.generateBtn} onClick={handleGenerate} disabled={generating||!fullName.trim()||!email.trim()}>
              {generating?'Creating…':'Generate Code & Create User'}
            </button>
          </div>
        </div>

        {/* Generated code display */}
        <div style={{display:'flex',flexDirection:'column',gap:'var(--space-4)'}}>
          {generated&&(
            <div className={styles.codeCard}>
              <p className={styles.codeLabel}>✅ User Created — Share This Code</p>
              <div className={styles.codeDisplay}>
                <span className={styles.codeText}>{generated.code}</span>
                <button className={styles.copyBtn} onClick={()=>copyCode(generated.code)}><IconCopy /> {copied?'Copied!':'Copy'}</button>
              </div>
              <div className={styles.codeDetails}>
                <p><strong>Name:</strong> {generated.name}</p>
                <p><strong>Email:</strong> {generated.email}</p>
                <p><strong>Role:</strong> {ROLES.find(r=>r.value===generated.role)?.label}</p>
              </div>
              <p className={styles.codeNote}>Give this code to the user. They'll use it on first login to verify their account.</p>
            </div>
          )}

          {history.length>0&&(
            <div className={styles.historyCard}>
              <p className={styles.historyTitle}>Generated This Session ({history.length})</p>
              {history.map((h,i)=>(
                <div key={i} className={styles.historyRow}>
                  <div style={{flex:1}}><p className={styles.historyName}>{h.name}</p><p className={styles.historyMeta}>{h.email} · {ROLES.find(r=>r.value===h.role)?.label}</p></div>
                  <button className={styles.copyBtn} onClick={()=>copyCode(h.code)} style={{fontSize:'.68rem'}}>{h.code}</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
