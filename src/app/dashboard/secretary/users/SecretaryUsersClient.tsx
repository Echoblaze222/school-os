'use client'
import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import type { ManagedUser, UserRole } from './page'
import styles from './users.module.css'

interface Props { users: ManagedUser[]; currentUserId: string }

const ROLES: UserRole[] = ['student','teacher','bursar','secretary','principal','admin','parent']
const ROLE_LABELS: Record<UserRole,string> = { student:'Student',teacher:'Teacher',bursar:'Bursar',secretary:'Secretary',principal:'Principal',admin:'Admin',parent:'Parent' }
const ROLE_STYLE: Record<UserRole,string> = { student:'roleStudent',teacher:'roleTeacher',bursar:'roleBursar',secretary:'roleSecretary',principal:'rolePrincipal',admin:'roleAdmin',parent:'roleParent' }

function initials(n: string) { return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }
function relTime(iso: string|null) {
  if (!iso) return 'Never'; const d=Date.now()-new Date(iso).getTime()
  const m=Math.floor(d/60000); if(m<60) return `${m}m ago`
  const h=Math.floor(m/60); if(h<24) return `${h}h ago`
  const days=Math.floor(h/24); if(days<30) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})
}

const IconSun=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
const IconMoon=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3a7 7 0 009.79 9.79z"/></svg>
const IconSearch=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IconX=()=><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

export default function SecretaryUsersClient({ users: initial, currentUserId }: Props) {
  const [isDark,setIsDark]=useState(true); const [mounted,setMounted]=useState(false)
  const [users,setUsers]=useState<ManagedUser[]>(initial)
  const [search,setSearch]=useState(''); const [roleFilter,setRoleFilter]=useState('')
  const [selected,setSelected]=useState<ManagedUser|null>(null)
  const [actionLoading,setActionLoading]=useState(false)
  const [toast,setToast]=useState<string|null>(null)

  useEffect(()=>{ const s=localStorage.getItem('schoolos_theme'); const dark=s!=='light'; setIsDark(dark); document.documentElement.setAttribute('data-theme',dark?'dark':'light'); setMounted(true) },[])
  const toggleTheme=()=>{ const n=!isDark; setIsDark(n); document.documentElement.setAttribute('data-theme',n?'dark':'light'); localStorage.setItem('schoolos_theme',n?'dark':'light') }

  const filtered = useMemo(()=>users.filter(u=>{
    const q=search.toLowerCase()
    return (!q||(u.full_name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q))) && (!roleFilter||u.role===roleFilter)
  }),[users,search,roleFilter])

  function showToast(m:string){setToast(m);setTimeout(()=>setToast(null),3000)}

  async function deactivate(u:ManagedUser) {
    setActionLoading(true); const supabase=createClient()
    const next=!u.is_active
    const {error}=await supabase.from('profiles').update({is_active:next}).eq('id',u.id)
    setActionLoading(false)
    if (!error) { setUsers(p=>p.map(x=>x.id===u.id?{...x,is_active:next}:x)); setSelected(s=>s?.id===u.id?{...s,is_active:next}:s); showToast(`${u.full_name} ${next?'activated':'deactivated'}`) }
  }

  async function resetOnboarding(u:ManagedUser) {
    setActionLoading(true); const supabase=createClient()
    const {error}=await supabase.from('profiles').update({onboarding_stage:'start'}).eq('id',u.id)
    setActionLoading(false)
    if (!error) { setUsers(p=>p.map(x=>x.id===u.id?{...x,onboarding_stage:'start'}:x)); setSelected(s=>s?.id===u.id?{...s,onboarding_stage:'start'}:s); showToast('Onboarding reset to start') }
  }

  async function generateCode(u:ManagedUser) {
    // Generate and store a new default code
    const year = new Date().getFullYear()
    const rand = Math.floor(1000+Math.random()*9000)
    const code = `SCH-${year}-${rand}`
    const supabase=createClient()
    setActionLoading(true)
    await supabase.from('profiles').update({default_code:code}).eq('id',u.id)
    setActionLoading(false)
    showToast(`New code: ${code}`)
  }

  if (!mounted) return null

  const stats = { total:users.length, active:users.filter(u=>u.is_active).length, students:users.filter(u=>u.role==='student').length, teachers:users.filter(u=>u.role==='teacher').length }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <div><h1 className={styles.pageTitle}>User <span>Management</span></h1><p className={styles.pageSubtitle}>{users.length} users · {stats.active} active</p></div>
          <div className={styles.headerRight}>
            <button className={styles.themeBtn} onClick={toggleTheme}>{isDark?<IconSun />:<IconMoon />}</button>
            <Link href="/dashboard/secretary/codes" className={styles.inviteBtn}>+ Generate Code</Link>
          </div>
        </div>
        <div className={styles.filterBar}>
          <div className={styles.searchWrap}><span className={styles.searchIcon}><IconSearch /></span><input className={styles.searchInput} placeholder="Search name or email…" value={search} onChange={e=>setSearch(e.target.value)} /></div>
          <select className={styles.roleFilter} value={roleFilter} onChange={e=>setRoleFilter(e.target.value)}>
            <option value="">All Roles</option>
            {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
      </header>

      <main className={styles.content}>
        <div className={styles.statsRow}>
          {[['Total',stats.total],['Active',stats.active],['Students',stats.students],['Teachers',stats.teachers]].map(([l,v])=>(
            <div key={String(l)} className={styles.statCard}><span className={styles.statValue}>{v}</span><span className={styles.statLabel}>{l}</span></div>
          ))}
        </div>
        <p className={styles.resultsMeta}>Showing {filtered.length} of {users.length} users</p>
        {filtered.length===0?<div className={styles.emptyState}>No users found.</div>:(
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead className={styles.tableHead}><tr><th>User</th><th>Role</th><th>Status</th><th>Onboarding</th><th>Last Seen</th><th></th></tr></thead>
              <tbody>
                {filtered.map(u=>(
                  <tr key={u.id} className={styles.tableRow} onClick={()=>setSelected(u)}>
                    <td><div className={styles.userCell}><div className={styles.avatar}>{initials(u.full_name)}</div><div><p className={styles.userName}>{u.full_name}{u.id===currentUserId?' (You)':''}</p><p className={styles.userEmail}>{u.email}</p></div></div></td>
                    <td><span className={`${styles.roleBadge} ${(styles as any)[ROLE_STYLE[u.role]]??''}`}>{ROLE_LABELS[u.role]}</span></td>
                    <td><div className={styles.activeIndicator}><div className={`${styles.dot} ${u.is_active?styles.dotActive:styles.dotInactive}`}/><span className={u.is_active?styles.activeText:styles.inactiveText}>{u.is_active?'Active':'Inactive'}</span></div></td>
                    <td><span style={{fontSize:'.72rem',color:'var(--text-muted)'}}>{u.onboarding_stage??'—'}</span></td>
                    <td><span className={styles.lastSeen}>{relTime(u.last_sign_in)}</span></td>
                    <td><button className={styles.actionBtn} onClick={e=>{e.stopPropagation();setSelected(u)}}>Manage</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {selected&&(
        <>
          <div className={styles.drawerOverlay} onClick={()=>setSelected(null)}/>
          <aside className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerAvatar}>{initials(selected.full_name)}</div>
              <div><p className={styles.drawerName}>{selected.full_name}</p><p className={styles.drawerEmail}>{selected.email}</p></div>
              <button className={styles.closeBtn} onClick={()=>setSelected(null)}><IconX /></button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.drawerSection}>
                <p className={styles.drawerSectionTitle}>Profile</p>
                {[['Role',<span className={`${styles.roleBadge} ${(styles as any)[ROLE_STYLE[selected.role]]??''}`}>{ROLE_LABELS[selected.role]}</span>],['Phone',selected.phone??'—'],['Class',selected.class_name??'—'],['Admission No.',selected.student_number??'—'],['Onboarding Stage',selected.onboarding_stage??'—'],['Last Seen',relTime(selected.last_sign_in)],['Joined',new Date(selected.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})]].map(([lbl,val])=>(
                  <div key={String(lbl)} className={styles.drawerField}><span className={styles.drawerFieldLabel}>{lbl}</span><span className={styles.drawerFieldValue}>{val as any}</span></div>
                ))}
              </div>
            </div>
            <div className={styles.drawerActions}>
              <button className={styles.drawerSecondaryBtn} onClick={()=>resetOnboarding(selected)} disabled={actionLoading}>Reset Onboarding</button>
              <button className={styles.drawerSecondaryBtn} onClick={()=>generateCode(selected)} disabled={actionLoading}>New Code</button>
              <button className={selected.is_active?styles.drawerDangerBtn:styles.drawerPrimaryBtn} onClick={()=>deactivate(selected)} disabled={actionLoading||selected.id===currentUserId}>
                {selected.is_active?'Deactivate':'Activate'}
              </button>
            </div>
          </aside>
        </>
      )}
      {toast&&<div className={styles.toast}>{toast}</div>}
    </div>
  )
}
