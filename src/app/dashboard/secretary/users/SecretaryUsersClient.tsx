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

  const ROLE_COLORS: Record<string,{bg:string;color:string;border:string}> = {
    student:   {bg:'rgba(16,185,129,0.12)',  color:'#10B981', border:'rgba(16,185,129,0.25)'},
    teacher:   {bg:'rgba(59,130,246,0.12)',  color:'#3B82F6', border:'rgba(59,130,246,0.25)'},
    bursar:    {bg:'rgba(245,158,11,0.12)',  color:'#F59E0B', border:'rgba(245,158,11,0.25)'},
    secretary: {bg:'rgba(139,92,246,0.12)', color:'#8B5CF6', border:'rgba(139,92,246,0.25)'},
    principal: {bg:'rgba(128,0,32,0.12)',   color:'#800020', border:'rgba(128,0,32,0.25)'},
    admin:     {bg:'rgba(107,114,128,0.12)',color:'#6B7280', border:'rgba(107,114,128,0.25)'},
    parent:    {bg:'rgba(6,182,212,0.12)',   color:'#06B6D4', border:'rgba(6,182,212,0.25)'},
  }

  return (
    <div className={styles.page}>
      <div className={styles.orb1}/><div className={styles.orb2}/>

      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>User Management</h1>
          <p className={styles.subtitle}>{users.length} users · {stats.active} active</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.themeBtn} onClick={toggleTheme}>{isDark?<IconSun />:<IconMoon />}</button>
          <Link href="/dashboard/secretary/codes" className={`${styles.actionBtn} ${styles.actionBtnSuccess}`} style={{textDecoration:'none',padding:'8px 14px',fontSize:'0.75rem',fontWeight:700}}>+ Generate Code</Link>
        </div>
      </header>

      {/* Stats */}
      <div className={styles.statsStrip}>
        {([['Total',stats.total],['Active',stats.active],['Students',stats.students],['Teachers',stats.teachers]] as [string,number][]).map(([l,v],i,arr)=>(
          <>
            <div key={l} className={styles.stat}><span className={styles.statVal}>{v}</span><span className={styles.statLbl}>{l}</span></div>
            {i < arr.length-1 && <div className={styles.statDiv}/>}
          </>
        ))}
      </div>

      {/* Filters */}
      <div className={styles.filtersWrap}>
        <div className={styles.searchWrap}>
          <span className={styles.searchIcon}><IconSearch /></span>
          <input className={`${styles.searchInput}`} placeholder="Search name or email…" value={search} onChange={e=>setSearch(e.target.value)} />
          {search && <button className={styles.clearSearch} onClick={()=>setSearch('')}><IconX /></button>}
        </div>
        <div className={styles.roleFilters}>
          {(['','student','teacher','bursar','secretary','principal','admin','parent'] as const).map(r=>{
            const isAll = r===''
            const rc = r ? ROLE_COLORS[r] : null
            const count = r ? users.filter(u=>u.role===r).length : users.length
            return (
              <button key={r||'all'}
                className={`${styles.filterChip} ${roleFilter===r?styles.filterChipActive:''}`}
                style={roleFilter===r && rc ? {background:rc.bg,borderColor:rc.border,color:rc.color} : {}}
                onClick={()=>setRoleFilter(r)}>
                {isAll?'All':ROLE_LABELS[r as UserRole]}
                <span className={styles.filterCount}>{count}</span>
              </button>
            )
          })}
        </div>
        <p className={styles.resultCount}>Showing {filtered.length} of {users.length} users</p>
      </div>

      {/* List */}
      <main className={styles.main}>
        {filtered.length===0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyTitle}>{search||roleFilter?'No users match your filters':'No users yet'}</p>
            <p className={styles.emptyBody}>{search||roleFilter?'Try adjusting your search or role filter.':'Users will appear here once they join via access codes.'}</p>
          </div>
        ) : (
          <div className={styles.userList}>
            {filtered.map(u=>{
              const rc = ROLE_COLORS[u.role] ?? {bg:'rgba(107,114,128,0.12)',color:'#6B7280',border:'rgba(107,114,128,0.25)'}
              return (
                <div key={u.id} className={`${styles.userRow} ${!u.is_active?styles.userRowInactive:''}`}>
                  <div className={styles.userMain}>
                    <div className={styles.userAvatar}>
                      {u.avatar_url ? <img className={styles.userAvatarImg} src={u.avatar_url} alt={u.full_name}/> : initials(u.full_name)}
                      {!u.is_active && <span className={styles.inactiveDot}/>}
                    </div>
                    <div className={styles.userInfo}>
                      <div className={styles.userNameRow}>
                        <span className={styles.userName}>{u.full_name}{u.id===currentUserId?' (You)':''}</span>
                        <span className={styles.userRoleBadge} style={{background:rc.bg,color:rc.color,border:`1px solid ${rc.border}`}}>{ROLE_LABELS[u.role as UserRole]}</span>
                      </div>
                      <p className={styles.userEmail}>{u.email}</p>
                      <div className={styles.userMeta}>
                        <span className={styles.onboardBadge} style={{background:u.is_active?'rgba(16,185,129,0.1)':'rgba(192,57,43,0.1)',color:u.is_active?'#10B981':'#C0392B',border:`1px solid ${u.is_active?'rgba(16,185,129,0.2)':'rgba(192,57,43,0.2)'}`}}>
                          {u.is_active?'Active':'Inactive'}
                        </span>
                        <span className={styles.userDate}>Joined {new Date(u.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'})}</span>
                        <span className={styles.userDate}>· Seen {relTime(u.last_sign_in)}</span>
                      </div>
                    </div>
                  </div>
                  <div className={styles.userActions}>
                    <button className={styles.actionBtn} onClick={()=>setSelected(u)}>View Profile</button>
                    <button className={`${styles.actionBtn}`} onClick={()=>generateCode(u)} disabled={actionLoading}>New Code</button>
                    <button className={`${styles.actionBtn}`} onClick={()=>resetOnboarding(u)} disabled={actionLoading||u.id===currentUserId}>Reset Onboarding</button>
                    <button
                      className={`${styles.actionBtn} ${u.is_active?styles.actionBtnDanger:styles.actionBtnSuccess}`}
                      onClick={()=>deactivate(u)} disabled={actionLoading||u.id===currentUserId}>
                      {u.is_active?'Deactivate':'Activate'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* Profile Drawer */}
      {selected&&(
        <div className={styles.drawerOverlay} onClick={()=>setSelected(null)}>
          <aside className={styles.drawer} onClick={e=>e.stopPropagation()}>
            <div className={styles.drawerHandle}/>
            <div className={styles.drawerAvatar}>
              {selected.avatar_url?<img className={styles.drawerAvatarImg} src={selected.avatar_url} alt={selected.full_name}/>:initials(selected.full_name)}
            </div>
            <p className={styles.drawerName}>{selected.full_name}</p>
            <span className={styles.drawerRoleBadge} style={{
              background:ROLE_COLORS[selected.role]?.bg??'rgba(107,114,128,0.12)',
              color:ROLE_COLORS[selected.role]?.color??'#6B7280',
              border:`1px solid ${ROLE_COLORS[selected.role]?.border??'rgba(107,114,128,0.25)'}`
            }}>{ROLE_LABELS[selected.role as UserRole]}</span>
            <div className={styles.drawerFields}>
              {([
                ['Email', selected.email],
                ['Phone', selected.phone??'—'],
                ['Status', selected.is_active?'Active':'Inactive'],
                ['Onboarding', selected.onboarding_stage??'—'],
                ['Last Seen', relTime(selected.last_sign_in)],
                ['Joined', new Date(selected.created_at).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'})],
                ...(selected.class_name?[['Class', selected.class_name]]:[] as any),
                ...(selected.student_number?[['Admission No.', selected.student_number]]:[] as any),
              ] as [string,string][]).map(([lbl,val])=>(
                <div key={lbl} className={styles.drawerField}>
                  <span className={styles.drawerFieldLabel}>{lbl}</span>
                  <span className={styles.drawerFieldValue}>{val}</span>
                </div>
              ))}
            </div>
            <div className={styles.modalFooter} style={{width:'100%',paddingInline:0}}>
              <button className={styles.actionBtn} onClick={()=>{resetOnboarding(selected)}} disabled={actionLoading||selected.id===currentUserId}>Reset Onboarding</button>
              <button className={styles.actionBtn} onClick={()=>generateCode(selected)} disabled={actionLoading}>New Code</button>
              <button
                className={`${styles.actionBtn} ${selected.is_active?styles.actionBtnDanger:styles.actionBtnSuccess}`}
                onClick={()=>deactivate(selected)} disabled={actionLoading||selected.id===currentUserId}>
                {selected.is_active?'Deactivate':'Activate'}
              </button>
            </div>
          </aside>
        </div>
      )}

      {toast&&(
        <div className={styles.codeReveal} style={{position:'fixed',bottom:90,left:16,right:16,zIndex:9999,animation:'fade-in 0.2s ease'}}>
          {toast}
        </div>
      )}
    </div>
  )
}
