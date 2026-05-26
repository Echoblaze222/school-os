'use client'
import { WifiOffIcon, RefreshIcon } from '@/components/Icons'
export default function OfflinePage() {
  return (
    <div style={{ minHeight:'100dvh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'var(--bg-base)', padding:24, textAlign:'center', gap:20 }}>
      <WifiOffIcon size={56} color="var(--text-faint)" strokeWidth={1}/>
      <div>
        <h1 style={{ fontSize:'1.4rem', fontWeight:800, color:'var(--text-primary)', margin:'0 0 8px', letterSpacing:'-0.02em' }}>You're offline</h1>
        <p style={{ fontSize:'0.875rem', color:'var(--text-muted)', margin:0, lineHeight:1.6 }}>
          Check your internet connection and try again.<br/>Some features may still work offline.
        </p>
      </div>
      <button onClick={() => window.location.reload()}
        style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 24px', background:'linear-gradient(135deg,var(--brand),var(--brand-dark))', color:'#fff', border:'none', borderRadius:999, fontWeight:700, fontSize:'0.875rem', cursor:'pointer', boxShadow:'0 4px 16px var(--brand-glow)' }}>
        <RefreshIcon size={16} color="white"/> Try Again
      </button>
    </div>
  )
}
