'use client'
// IdCardClient.tsx
import { useRef } from 'react'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { IdCardIcon, DownloadIcon } from '@/components/Icons'
import styles from './page.module.css'
interface Props { profile: any; school: any; userId: string }
export default function IdCardClient({ profile, school, userId }: Props) {
  const cardRef = useRef<HTMLDivElement>(null)
  const schoolColor = school?.primary_color ?? '#7C3AED'
  async function downloadCard() {
    // Simple print-based download
    const el = cardRef.current
    if (!el) return
    const win = window.open('', '_blank')
    if (!win) return
    win.document.write(`<html><head><style>
      body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;background:#f0f0f0;}
      .card{width:340px;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.15);}
      .header{background:${schoolColor};padding:24px;text-align:center;color:white;}
      .avatar{width:80px;height:80px;border-radius:50%;border:3px solid rgba(255,255,255,0.5);margin:0 auto 12px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:800;}
      .name{font-size:1.1rem;font-weight:800;margin:0 0 4px;}
      .role{font-size:0.78rem;opacity:0.8;margin:0;}
      .body{padding:20px;}
      .row{display:flex;justify-content:space-between;margin-bottom:12px;font-size:0.85rem;}
      .label{color:#6b7280;}
      .value{font-weight:600;}
      .code{text-align:center;margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;font-family:monospace;font-size:1rem;font-weight:700;letter-spacing:0.1em;}
    </style></head><body>${el.innerHTML}</body></html>`)
    win.document.close()
    setTimeout(() => { win.print(); win.close() }, 500)
  }
  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />
      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="My ID Card" showBack />
        <main className={styles.main} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'var(--space-6)', paddingTop:'var(--space-8)' }}>
          {/* Card */}
          <div ref={cardRef} style={{ width:'100%', maxWidth:340, background:'var(--bg-surface)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-2xl)', overflow:'hidden', boxShadow:'0 8px 40px rgba(0,0,0,0.3)' }}>
            {/* Header */}
            <div style={{ background:schoolColor, padding:'var(--space-6)', textAlign:'center', color:'#fff' }}>
              {school?.logo_url
                ? <img src={school.logo_url} alt="" style={{ width:64, height:64, borderRadius:12, margin:'0 auto 12px', display:'block' }}/>
                : <div style={{ width:64, height:64, borderRadius:12, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:'1.5rem', fontWeight:800 }}>{school?.name?.[0]}</div>
              }
              <p style={{ fontSize:'0.75rem', fontWeight:700, letterSpacing:'0.1em', textTransform:'uppercase', opacity:0.8, margin:'0 0 4px' }}>
                {school?.name ?? 'SchoolOS'}
              </p>
              <p style={{ fontSize:'0.65rem', opacity:0.65, margin:0 }}>Student Identity Card</p>
            </div>
            {/* Avatar */}
            <div style={{ display:'flex', justifyContent:'center', marginTop:-36 }}>
              <div style={{ width:72, height:72, borderRadius:'50%', background:schoolColor, border:'3px solid var(--bg-surface)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'1.4rem', fontWeight:800, color:'#fff', overflow:'hidden' }}>
                {profile?.avatar_url
                  ? <img src={profile.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }}/>
                  : (profile?.full_name?.[0] ?? 'S')
                }
              </div>
            </div>
            {/* Info */}
            <div style={{ padding:'var(--space-5) var(--space-6)' }}>
              <p style={{ textAlign:'center', fontSize:'1rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 2px' }}>{profile?.full_name}</p>
              <p style={{ textAlign:'center', fontSize:'0.72rem', color:'var(--text-muted)', margin:'0 0 var(--space-5)', textTransform:'capitalize' }}>
                {profile?.class_level ?? 'Student'}
              </p>
              {[
                ['Student ID', profile?.default_code ?? '—'],
                ['School',     school?.name ?? '—'],
                ['Session',    new Date().getFullYear() + '/' + (new Date().getFullYear()+1)],
              ].map(([label, value]) => (
                <div key={label} style={{ display:'flex', justifyContent:'space-between', marginBottom:'var(--space-2)', fontSize:'0.82rem' }}>
                  <span style={{ color:'var(--text-muted)' }}>{label}</span>
                  <span style={{ fontWeight:600, color:'var(--text-primary)' }}>{value}</span>
                </div>
              ))}
              <div style={{ textAlign:'center', marginTop:'var(--space-4)', padding:'var(--space-3)', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-md)', fontFamily:'monospace', fontSize:'1rem', fontWeight:800, color:'var(--text-primary)', letterSpacing:'0.1em' }}>
                {profile?.default_code ?? 'STU-000000'}
              </div>
            </div>
          </div>
          {/* Download button */}
          <button onClick={downloadCard}
            style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', padding:'12px 24px', background:`linear-gradient(135deg,${schoolColor},${schoolColor}cc)`, color:'#fff', border:'none', borderRadius:'999px', fontWeight:700, fontSize:'0.875rem', cursor:'pointer', boxShadow:`0 4px 16px ${schoolColor}50` }}>
            <DownloadIcon size={16} color="white"/> Download / Print
          </button>
          <div className={styles.spacer}/>
        </main>
      </div>
    </div>
  )
}
