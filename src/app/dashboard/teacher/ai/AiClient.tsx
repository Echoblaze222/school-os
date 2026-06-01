'use client'
import { useState, useEffect, useRef } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { AiIcon, SendIcon, RefreshIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/ai/ai.module.css'

const STARTERS = [
  '📝 Write a lesson plan for JSS2 Mathematics — Quadratic Equations',
  '📋 Generate 10 multiple choice questions on photosynthesis for SSS1',
  '✏️ Create a marking scheme for an essay on Nigerian Independence',
  '📊 Suggest ways to improve student engagement in my class',
  '🗓️ Write a term scheme of work for English Language JSS3',
]

interface Message { role: 'user' | 'assistant'; content: string; ts: number }
interface Props { profile: any; school: any; userId: string }

export default function AiClient({ profile, school, userId }: Props) {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, loading])

  useEffect(() => {
    try {
      const saved = localStorage.getItem('schoolos_ai_teacher_' + userId)
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [userId])

  function saveHistory(msgs: Message[]) {
    try { localStorage.setItem('schoolos_ai_teacher_' + userId, JSON.stringify(msgs.slice(-30))) } catch {}
  }

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
        method: 'POST',
        headers: { 'Content-Type':'application/json' },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role:m.role, content:m.content })),
          userId, schoolId: school?.id,
          systemContext: 'teacher',
        }),
      })
      if (!res.ok) throw new Error('AI unavailable')
      const data = await res.json()
      const reply = data.content?.[0]?.text ?? 'Sorry, I could not respond.'
      const aiMsg: Message = { role:'assistant', content:reply, ts:Date.now() }
      const updated = [...newHistory, aiMsg]
      setMessages(updated)
      saveHistory(updated)
    } catch { setError('AI is temporarily unavailable. Try again.') }
    setLoading(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
  }

  return (
    <RolePageWrapper userId={userId} role="teacher" profile={profile} school={school} title="AI Teaching Assistant" showBack={false}>
      <div style={{ display:'flex', flexDirection:'column', height:'calc(100dvh - 130px)' }}>
        <div className={styles.messages} style={{ flex:1 }}>
          {messages.length === 0 && (
            <div className={styles.welcome}>
              <div className={styles.aiAvatar} style={{ background:schoolColor }}>
                <AiIcon size={28} color="white"/>
              </div>
              <h2>Hi {profile?.full_name?.split(' ')[0] ?? 'Teacher'} 👋</h2>
              <p>I can help with lesson plans, quiz generation, marking schemes, and more.</p>
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
            <div key={i} className={`${styles.msgRow} ${msg.role==='user' ? styles.userRow : ''}`}>
              {msg.role === 'assistant' && (
                <div className={styles.aiAvatarSm} style={{ background:schoolColor }}>
                  <AiIcon size={14} color="white"/>
                </div>
              )}
              <div className={`${styles.bubble} ${msg.role==='user' ? styles.userBubble : styles.aiBubble}`}
                style={msg.role==='user' ? { background:schoolColor } : undefined}>
                <div className={styles.bubbleText}
                  dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }}/>
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

        <div className={styles.inputBar}>
          {messages.length > 0 && (
            <button className={styles.clearBtn}
              onClick={() => { setMessages([]); try { localStorage.removeItem('schoolos_ai_teacher_'+userId) } catch {} }}>
              <RefreshIcon size={16} color="var(--text-muted)"/>
            </button>
          )}
          <textarea ref={inputRef} className={styles.textarea} value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder="Ask me to write a lesson plan, generate questions, create a scheme of work..."
            rows={1}/>
          <button className={styles.sendBtn} style={{ background:schoolColor }}
            onClick={() => sendMessage(input)} disabled={!input.trim() || loading}>
            <SendIcon size={15} color="white"/>
          </button>
        </div>
      </div>
    </RolePageWrapper>
  )
}
