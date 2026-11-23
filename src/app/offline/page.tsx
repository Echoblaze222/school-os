'use client'
import { useEffect, useState } from 'react'
import { WifiOffIcon, RefreshIcon } from '@/components/Icons'
import { loadIdentity, readLastKnownUserId } from '@/lib/offline/identity'

export default function OfflinePage() {
  // Offline-capable screens this phone has saved data for (see src/lib/offline).
  // Plain links on purpose: a full page load is what the service worker handles.
  const [canTakeAttendance, setCanTakeAttendance] = useState(false)

  useEffect(() => {
    let active = true
    ;(async () => {
      const userId = readLastKnownUserId()
      if (!userId) return
      const saved = await loadIdentity(userId)
      if (active && saved?.profile?.role === 'teacher') setCanTakeAttendance(true)
    })()
    return () => { active = false }
  }, [])

  return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:24, textAlign:'center', gap:20 }}>
      <WifiOffIcon size={56} color="var(--text-faint)" strokeWidth={1}/>
      <div>
        <h1 style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 8px', letterSpacing:'-0.02em' }}>You're offline</h1>
        <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', margin:0, lineHeight:1.6 }}>
          Check your internet connection and try again.<br/>Some features may still work offline.
        </p>
      </div>
      {canTakeAttendance && (
        <a href="/offline/teacher/attendance"
          style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 24px', background:'var(--glass-bg)', color:'var(--text-primary)', border:'1px solid var(--glass-border)', borderRadius:999, fontWeight:700, fontSize:'0.875rem', textDecoration:'none' }}>
          Take attendance (works offline)
        </a>
      )}
      <button onClick={() => window.location.reload()}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 24px', background:'linear-gradient(135deg,var(--brand),var(--brand-dark))', color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:'0.875rem', cursor:'pointer', boxShadow:'0 4px 16px var(--brand-glow)' }}>
        <RefreshIcon size={16} color="white"/> Try Again
      </button>
    </div>
  )
}
