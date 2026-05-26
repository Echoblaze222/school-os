'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import type { TeacherRow } from './page'
import styles from '../principal-dashboard.module.css'

interface Props { teachers: TeacherRow[] }

function initials(n: string) { return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }
function relTime(iso: string | null) {
  if (!iso) return 'Never'
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d/60000)
  if (m<60) return `${m}m ago`; const h=Math.floor(m/60)
  if (h<24) return `${h}h ago`; return `${Math.floor(h/24)}d ago`
}
const IconSun=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconX=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
const IconChevronLeft=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M15 18l-6-6 6-6"/></svg>

export default function TeachersClient({ teachers }: Props) {
  const [isDark, setIsDark] = useState(true)
  const [mounted, setMounted] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<TeacherRow | null>(null)
  useEffect(() => {
    const s = localStorage.getItem('schoolos_theme'); const dark = s !== 'light'
    setIsDark(dark); document.documentElement.setAttribute('data-theme', dark?'dark':'light'); setMounted(true)
  }, [])
  const toggleTheme = () => { const n=!isDark; setIsDark(n); document.documentElement.setAttribute('data-theme',n?'dark':'light'); localStorage.setItem('schoolos_theme',n?'dark':'light') }
  const filtered = useMemo(() => teachers.filter(t => !search || t.full_name.toLowerCase().includes(search.toLowerCase()) || t.email.toLowerCase().includes(search.toLowerCase())), [teachers, search])
  if (!mounted) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <Link href="/dashboard/principal" className={styles.backBtn} style={{marginBottom:8,display:'inline-flex'}}><IconChevronLeft /> Dashboard</Link>
          <h1 className={styles.pageTitle}>All <span>Teachers</span></h1>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.themeBtn} onClick={toggleTheme}>{isDark?<IconSun />:<IconMoon />}</button>
        </div>
      </header>
      <div style={{position:'relative',zIndex:1,padding:'var(--space-6)',maxWidth:920}}>
        <div className={styles.filterBar} style={{marginBottom:'var(--space-4)'}}>
          <input className={styles.searchInput} placeholder="Search by name or email…" value={search} onChange={e=>setSearch(e.target.value)} />
          <span style={{fontSize:'.78rem',color:'var(--text-muted)',marginLeft:'auto'}}>{filtered.length} of {teachers.length} teachers</span>
        </div>
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead><tr className={styles.tableHead}>
              <th>Teacher</th><th>Subjects</th><th>Classes</th><th>Last Active</th><th>Notes</th><th>Results</th><th>Status</th>
            </tr></thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={7}><div className={styles.emptyState}>No teachers found.</div></td></tr>
              ) : filtered.map(t => (
                <tr key={t.id} className={styles.tableRow} onClick={()=>setSelected(t)}>
                  <td><div className={styles.userCell}><div className={styles.avatar}>{initials(t.full_name)}</div><div><p className={styles.nameCell}>{t.full_name}</p><p className={styles.metaCell}>{t.email}</p></div></div></td>
                  <td><span style={{fontSize:'.78rem',color:'var(--text-secondary)'}}>{t.subjects.slice(0,2).join(', ')}{t.subjects.length>2?` +${t.subjects.length-2}`:''}</span></td>
                  <td><span style={{fontSize:'.78rem',color:'var(--text-secondary)'}}>{t.classes.slice(0,2).join(', ')}{t.classes.length>2?` +${t.classes.length-2}`:''}</span></td>
                  <td><span style={{fontSize:'.75rem',color:'var(--text-muted)'}}>{relTime(t.last_activity)}</span></td>
                  <td><span style={{fontFamily:'var(--font-display)',fontSize:'1rem',fontWeight:700,color:'var(--text-primary)'}}>{t.notes_uploaded}</span></td>
                  <td><span style={{fontFamily:'var(--font-display)',fontSize:'1rem',fontWeight:700,color:'var(--text-primary)'}}>{t.results_posted}</span></td>
                  <td><span className={`${styles.badge} ${t.is_active?styles.badgeSuccess:styles.badgeError}`}>{t.is_active?'Active':'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <>
          <div className={styles.drawerOverlay} onClick={()=>setSelected(null)} />
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerAvatar}>{initials(selected.full_name)}</div>
              <div><p className={styles.drawerName}>{selected.full_name}</p><p className={styles.drawerSub}>{selected.email}</p></div>
              <button className={styles.closeBtn} onClick={()=>setSelected(null)}><IconX /></button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.drawerSection}>
                <p className={styles.drawerSectionTitle}>Teaching Info</p>
                <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Subjects</span><span className={styles.drawerFieldValue}>{selected.subjects.join(', ') || '—'}</span></div>
                <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Classes</span><span className={styles.drawerFieldValue}>{selected.classes.join(', ') || '—'}</span></div>
                <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Phone</span><span className={styles.drawerFieldValue}>{selected.phone ?? '—'}</span></div>
                <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Status</span><span className={`${styles.badge} ${selected.is_active?styles.badgeSuccess:styles.badgeError}`}>{selected.is_active?'Active':'Inactive'}</span></div>
              </div>
              <div className={styles.drawerSection}>
                <p className={styles.drawerSectionTitle}>Activity</p>
                <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Last Active</span><span className={styles.drawerFieldValue}>{relTime(selected.last_activity)}</span></div>
                <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Last Action</span><span className={styles.drawerFieldValue} style={{maxWidth:'60%',textAlign:'right'}}>{selected.last_action ?? '—'}</span></div>
                <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Notes Uploaded</span><span className={styles.drawerFieldValue}>{selected.notes_uploaded}</span></div>
                <div className={styles.drawerField}><span className={styles.drawerFieldLabel}>Results Posted</span><span className={styles.drawerFieldValue}>{selected.results_posted}</span></div>
              </div>
            </div>
          </aside>
        </>
      )}
    </div>
  )
}
