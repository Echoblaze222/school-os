'use client'

// src/app/dashboard/principal/ai/AIPrincipalClient.tsx

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Props {
  principalName: string
  schoolName: string
  systemPrompt: string
}

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
}

const QUICK_PROMPTS = [
  { emoji: '💰', label: "Summarise this term's fee collection" },
  { emoji: '📊', label: 'Generate school performance report' },
  { emoji: '✉️', label: 'Draft a circular to parents' },
  { emoji: '👩‍🏫', label: 'Show teacher activity summary' },
  { emoji: '⚠️', label: 'Which parents owe the most' },
  { emoji: '📋', label: 'Write a staff meeting agenda' },
]

function MarkdownContent({ text }: { text: string }) {
  const lines = text.split('\n')
  const elements: React.ReactNode[] = []
  let key = 0
  const parseInline = (line: string): React.ReactNode => {
    return line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) return <strong key={i}>{p.slice(2,-2)}</strong>
      if (p.startsWith('`') && p.endsWith('`'))   return <code key={i} style={{ background:'var(--glass-bg)', padding:'1px 5px', borderRadius:4, fontSize:'0.88em', fontFamily:'monospace' }}>{p.slice(1,-1)}</code>
      return p
    })
  }
  for (const line of lines) {
    if (!line.trim()) { elements.push(<br key={key++} />); continue }
    if (/^###\s/.test(line)) { elements.push(<h4 key={key++} style={{ fontFamily:'var(--font-display)', fontSize:'1rem', fontWeight:600, color:'var(--text-primary)', margin:'10px 0 4px' }}>{line.replace(/^###\s/, '')}</h4>); continue }
    if (/^##\s/.test(line))  { elements.push(<h3 key={key++} style={{ fontFamily:'var(--font-display)', fontSize:'1.1rem', fontWeight:600, color:'var(--text-primary)', margin:'12px 0 4px' }}>{line.replace(/^##\s/, '')}</h3>); continue }
    if (/^#\s/.test(line))   { elements.push(<h2 key={key++} style={{ fontFamily:'var(--font-display)', fontSize:'1.2rem', fontWeight:600, color:'var(--text-primary)', margin:'12px 0 6px' }}>{line.replace(/^#\s/, '')}</h2>); continue }
    if (/^[-*]\s/.test(line)){ elements.push(<div key={key++} style={{ display:'flex', gap:8, margin:'2px 0' }}><span style={{ color:'var(--text-accent)', flexShrink:0, marginTop:2 }}>•</span><span>{parseInline(line.replace(/^[-*]\s/, ''))}</span></div>); continue }
    if (/^\d+\.\s/.test(line)){ const n=line.match(/^(\d+)\./)?.[1]; elements.push(<div key={key++} style={{ display:'flex', gap:8, margin:'2px 0' }}><span style={{ color:'var(--text-accent)', flexShrink:0, minWidth:18, fontWeight:600 }}>{n}.</span><span>{parseInline(line.replace(/^\d+\.\s/, ''))}</span></div>); continue }
    elements.push(<p key={key++} style={{ margin:'2px 0', lineHeight:1.6 }}>{parseInline(line)}</p>)
  }
  return <div style={{ fontFamily:'var(--font-body)', fontSize:'0.9rem', color:'var(--text-primary)' }}>{elements}</div>
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Principal navigation">
      <Link href="/dashboard/principal" className="nav-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        <span>Home</span>
      </Link>
      <Link href="/dashboard/principal/reports" className="nav-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        <span>Reports</span>
      </Link>
      <Link href="/dashboard/principal" className="nav-home" aria-label="Dashboard">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg>
      </Link>
      <Link href="/dashboard/principal/staff" className="nav-item">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <span>Staff</span>
      </Link>
      <Link href="/dashboard/principal/ai" className="nav-item active">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
        <span>AI</span>
      </Link>
    </nav>
  )
}

export default function AIPrincipalClient({ principalName, schoolName, systemPrompt }: Props) {
  const router = useRouter()
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const firstName = principalName.split(' ')[0]

  useEffect(() => {
    const theme = localStorage.getItem('schoolos_theme') ?? 'dark'
    document.documentElement.setAttribute('data-theme', theme)
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  useEffect(() => {
    const ta = textareaRef.current; if (!ta) return
    ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'
  }, [input])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    setError('')
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: text.trim() }
    const history = [...messages, userMsg]
    setMessages(history); setInput(''); setLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ systemPrompt, messages: history.map(m => ({ role: m.role, content: m.content })) }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error ?? `Error ${res.status}`) }
      const data = await res.json()
      setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'assistant', content: data.content ?? data.message ?? '' }])
    } catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong.') }
    finally { setLoading(false) }
  }

  const isEmpty = messages.length === 0
  const bubbleBase: React.CSSProperties = { backdropFilter: 'blur(20px)', maxWidth: '80%' }

  return (
    <div style={{ minHeight:'100dvh', background:'var(--bg-base)', display:'flex', flexDirection:'column', position:'relative', overflow:'hidden' }}>
      <div className="burgundy-glow-orb" style={{ width:340, height:340, top:-80, right:-80, opacity:0.45 }} aria-hidden />

      <header style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'var(--space-6) var(--space-5) var(--space-4)', position:'sticky', top:0, zIndex:'var(--z-card)', background:'var(--bg-overlay)', backdropFilter:'blur(20px)', borderBottom:'1px solid var(--glass-border)' }}>
        <button onClick={() => router.push('/dashboard/principal')} style={{ display:'flex', alignItems:'center', justifyContent:'center', width:38, height:38, borderRadius:'var(--radius-md)', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', color:'var(--text-primary)', cursor:'pointer' }} aria-label="Back">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div style={{ flex:1, textAlign:'center', padding:'0 var(--space-3)' }}>
          <h1 style={{ fontFamily:'var(--font-display)', fontSize:'1.5rem', fontWeight:600, color:'var(--text-primary)', lineHeight:1.1 }}>AI Assistant</h1>
          <p style={{ fontFamily:'var(--font-body)', fontSize:'0.68rem', color:'var(--text-muted)', letterSpacing:'0.05em', marginTop:2 }}>School intelligence · {schoolName}</p>
        </div>
        <button style={{ display:'flex', alignItems:'center', justifyContent:'center', width:38, height:38, borderRadius:'var(--radius-md)', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', color:'var(--text-secondary)', cursor:'pointer' }} aria-label="Toggle theme"
          onClick={() => { const c=document.documentElement.getAttribute('data-theme')??'dark'; const n=c==='dark'?'light':'dark'; document.documentElement.setAttribute('data-theme',n); localStorage.setItem('schoolos_theme',n) }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>
        </button>
      </header>

      <main style={{ flex:1, overflowY:'auto', padding:'var(--space-4) var(--space-5)', display:'flex', flexDirection:'column', gap:'var(--space-4)', paddingBottom:200 }}>
        {isEmpty && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'var(--space-5)', paddingTop:'var(--space-8)', animation:'fade-up 0.5s ease' }}>
            <div style={{ width:72, height:72, borderRadius:'50%', background:'var(--burgundy-subtle)', border:'2px solid rgba(128,0,32,0.25)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
            </div>
            <div style={{ textAlign:'center' }}>
              <h2 style={{ fontFamily:'var(--font-display)', fontSize:'1.4rem', fontWeight:600, color:'var(--text-primary)' }}>Good day, {firstName}</h2>
              <p style={{ fontFamily:'var(--font-body)', fontSize:'0.85rem', color:'var(--text-secondary)', marginTop:6, lineHeight:1.5 }}>Your school intelligence assistant is ready.<br/>What would you like to review today?</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'var(--space-2)', width:'100%', maxWidth:480 }}>
              {QUICK_PROMPTS.map((qp, i) => (
                <button key={i} onClick={() => sendMessage(qp.label)} style={{ display:'flex', alignItems:'center', gap:'var(--space-2)', padding:'var(--space-3) var(--space-4)', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-lg)', cursor:'pointer', fontFamily:'var(--font-body)', fontSize:'0.78rem', fontWeight:500, color:'var(--text-secondary)', textAlign:'left', transition:'all 0.2s' }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='var(--glass-bg-hover)';(e.currentTarget as HTMLElement).style.transform='translateY(-1px)'}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='var(--glass-bg)';(e.currentTarget as HTMLElement).style.transform='translateY(0)'}}>
                  <span style={{ fontSize:'1rem', flexShrink:0 }}>{qp.emoji}</span><span>{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} style={{ display:'flex', flexDirection:msg.role==='user'?'row-reverse':'row', gap:'var(--space-3)', alignItems:'flex-start', animation:'fade-up 0.3s ease' }}>
            {msg.role==='assistant' && <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--burgundy-subtle)', border:'1px solid rgba(128,0,32,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div>}
            <div style={{ ...bubbleBase, padding:'var(--space-4) var(--space-5)', borderRadius:msg.role==='user'?'var(--radius-xl) var(--radius-xl) var(--radius-sm) var(--radius-xl)':'var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)', background:msg.role==='user'?'linear-gradient(135deg, var(--burgundy), var(--burgundy-light))':'var(--glass-bg)', border:msg.role==='user'?'none':'1px solid var(--glass-border)', boxShadow:msg.role==='user'?'0 4px 20px var(--burgundy-glow)':'var(--glass-shadow)' }}>
              {msg.role==='user'?<p style={{ fontFamily:'var(--font-body)', fontSize:'0.9rem', color:'#fff', lineHeight:1.6, margin:0 }}>{msg.content}</p>:<MarkdownContent text={msg.content}/>}
            </div>
          </div>
        ))}

        {loading && <div style={{ display:'flex', gap:'var(--space-3)', alignItems:'flex-start' }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--burgundy-subtle)', border:'1px solid rgba(128,0,32,0.25)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg></div>
          <div style={{ padding:'var(--space-4) var(--space-5)', background:'var(--glass-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl) var(--radius-xl) var(--radius-xl) var(--radius-sm)', display:'flex', gap:6, alignItems:'center' }}>
            {[0,1,2].map(i=><span key={i} style={{ width:7, height:7, borderRadius:'50%', background:'var(--text-muted)', display:'inline-block', animation:`pulse-dot 1.2s ease-in-out ${i*0.2}s infinite` }}/>)}
          </div>
        </div>}

        {error && <div style={{ background:'var(--error-bg)', border:'1px solid rgba(192,57,43,0.25)', borderRadius:'var(--radius-lg)', padding:'var(--space-3) var(--space-4)', fontFamily:'var(--font-body)', fontSize:'0.82rem', color:'var(--error)', display:'flex', alignItems:'center', gap:'var(--space-2)' }}>{error}</div>}
        <div ref={messagesEndRef}/>
      </main>

      <div style={{ position:'fixed', bottom:90, left:'50%', transform:'translateX(-50%)', width:'min(560px, calc(100vw - 32px))', background:'var(--nav-bg)', border:'1px solid var(--glass-border)', borderRadius:'var(--radius-xl)', backdropFilter:'blur(24px)', padding:'var(--space-3) var(--space-3) var(--space-3) var(--space-4)', display:'flex', alignItems:'flex-end', gap:'var(--space-2)', boxShadow:'0 8px 32px rgba(0,0,0,0.3)', zIndex:200 }}>
        <textarea ref={textareaRef} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage(input)}}} placeholder="Ask anything… (Shift+Enter for new line)" rows={1} disabled={loading} style={{ flex:1, background:'none', border:'none', outline:'none', resize:'none', fontFamily:'var(--font-body)', fontSize:'0.9rem', color:'var(--text-primary)', lineHeight:1.5, maxHeight:120, overflowY:'auto', scrollbarWidth:'none' }} aria-label="Message"/>
        <button onClick={()=>sendMessage(input)} disabled={!input.trim()||loading} style={{ display:'flex', alignItems:'center', justifyContent:'center', width:38, height:38, borderRadius:'50%', flexShrink:0, background:input.trim()&&!loading?'linear-gradient(135deg, var(--burgundy), var(--burgundy-light))':'var(--glass-bg)', border:'1px solid var(--glass-border)', color:input.trim()&&!loading?'#fff':'var(--text-muted)', cursor:input.trim()&&!loading?'pointer':'not-allowed', transition:'all 0.2s', boxShadow:input.trim()&&!loading?'0 4px 12px var(--burgundy-glow)':'none' }} aria-label="Send">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        </button>
      </div>
      <BottomNav/>
    </div>
  )
}
