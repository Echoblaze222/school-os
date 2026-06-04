'use client'
import { useState, useEffect, useRef } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { AiIcon, SendIcon, RefreshIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/ai/ai.module.css'

const STARTERS = [
  '📊 Analyse our school\'s performance this term and suggest improvements',
  '📋 Write a staff meeting agenda for this week',
  '🎯 How can I improve student attendance in my school?',
  '📄 Draft a letter to parents about upcoming exams',
  '🏫 Write a school improvement plan for the next academic session',
]

interface Message { role: 'user' | 'assistant'; content: string; ts: number }
interface Props { profile: any; school: any; userId: string }

export default function AiClient({ profile, school, userId }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const bottomRef   = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('schoolos_ai_principal_' + userId)
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [userId])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    setError('')
    const userMsg: Message = { role:'user', content:text.trim(), ts:Date.now() }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role:m.role, content:m.content })),
          userId, schoolId: school?.id, systemContext:'principal',
        }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      const reply = data.content?.[0]?.text ?? 'Unable to respond.'
      const updated = [...newHistory, { role:'assistant' as const, content:reply, ts:Date.now() }]
      setMessages(updated)
      try { localStorage.setItem('schoolos_ai_principal_'+userId, JSON.stringify(updated.slice(-30))) } catch {}
    } catch { setError('AI is temporarily unavailable.') }
    setLoading(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  }

  return (
    <RolePageWrapper userId={userId} role="principal" profile={profile} school={school} title="AI School Insights" fullHeight>
      <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
        <div className={styles.messages} style={{ flex:1, minHeight:0, overflowY:'auto', paddingBottom:'calc(64px + 76px + 8px)' }}>
          {messages.length === 0 && (
            <div className={styles.welcome}>
              <div className={styles.aiAvatar} style={{ background:schoolColor }}>
                <AiIcon size={28} color="white"/>
              </div>
              <h2>School AI Insights</h2>
              <p>Get intelligent analysis, draft communications, and plan improvements for {school?.name}.</p>
              <div className={styles.starters}>
                {STARTERS.map(s => (
                  <button key={s} className={styles.starter}
                    style={{ borderColor:schoolColor+'40' }}
                    onClick={() => sendMessage(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`${styles.msgRow} ${msg.role==='user'?styles.userRow:''}`}>
              {msg.role === 'assistant' && (
                <div className={styles.aiAvatarSm} style={{ background:schoolColor }}>
                  <AiIcon size={14} color="white"/>
                </div>
              )}
              <div className={`${styles.bubble} ${msg.role==='user'?styles.userBubble:styles.aiBubble}`}
                style={msg.role==='user'?{background:schoolColor}:undefined}>
                <div className={styles.bubbleText}
                  dangerouslySetInnerHTML={{ __html:msg.content.replace(/\n/g,'<br/>') }}/>
                <span className={styles.bubbleTime}>{formatTime(msg.ts)}</span>
              </div>
            </div>
          ))}

          {loading && (
            <div className={styles.msgRow}>
              <div className={styles.aiAvatarSm} style={{ background:schoolColor }}>
                <AiIcon size={14} color="white"/>
              </div>
              <div className={styles.aiBubble}>
                <div className={styles.typingDots}><span/><span/><span/></div>
              </div>
            </div>
          )}
          {error && <p className={styles.errorMsg}>{error}</p>}
          <div ref={bottomRef}/>
        </div>

        <div className={`${styles.inputBar} ${styles.inputBarFloating}`}>
          {messages.length > 0 && (
            <button className={styles.clearBtn}
              onClick={() => { setMessages([]); try { localStorage.removeItem('schoolos_ai_principal_'+userId) } catch {} }}>
              <RefreshIcon size={16} color="var(--text-muted)"/>
            </button>
          )}
          <textarea className={styles.textarea} value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder="Ask about school performance, staff management, student welfare..."
            rows={1}/>
          <button className={styles.sendBtn} style={{ background:schoolColor }}
            onClick={() => sendMessage(input)} disabled={!input.trim()||loading}>
            <SendIcon size={15} color="white"/>
          </button>
        </div>
      </div>
    </RolePageWrapper>
  )
}
