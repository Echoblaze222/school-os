'use client'
// components/UniversalAIPage.tsx
// Shared AI assistant page used by every role dashboard.
// Each role gets its own starters, system context, and local-storage key.

import { useState, useEffect, useRef } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { AiIcon, SendIcon, RefreshIcon } from '@/components/Icons'
import styles from '@/app/dashboard/student/ai/ai.module.css'

interface Message { role: 'user' | 'assistant'; content: string; ts: number }
interface Props   { profile: any; school: any; userId: string; role: string }

const ROLE_CONFIG: Record<string, { title: string; subtitle: string; context: string; starters: string[] }> = {
  principal: {
    title:    'AI School Insights',
    subtitle: 'Analyse, plan, and communicate for your school',
    context:  'principal',
    starters: [
      '📊 Analyse our school\'s performance this term and suggest improvements',
      '📋 Write a staff meeting agenda for this week',
      '🎯 How can I improve student attendance in my school?',
      '📄 Draft a letter to parents about upcoming exams',
      '🏫 Write a school improvement plan for the next academic session',
    ],
  },
  teacher: {
    title:    'AI Teaching Assistant',
    subtitle: 'Lesson plans, assessments, and classroom support',
    context:  'teacher',
    starters: [
      '📝 Create a lesson plan for quadratic equations (JSS3)',
      '📊 Suggest 10 quiz questions on photosynthesis',
      '✉️ Draft a message to parents about a struggling student',
      '🎯 How can I improve engagement in my Maths class?',
      '📋 Write end-of-term comments for a student who improved greatly',
    ],
  },
  student: {
    title:    'AI Study Assistant',
    subtitle: 'Study help, explanations, and exam prep',
    context:  'student',
    starters: [
      '📚 Explain the causes of World War 1 simply',
      '🧮 Help me solve quadratic equations step by step',
      '✍️ How do I write a good essay introduction?',
      '🔬 Summarise the process of photosynthesis',
      '📝 Give me 5 practice questions on fractions',
    ],
  },
  bursar: {
    title:    'AI Finance Assistant',
    subtitle: 'Fee management, reports, and financial guidance',
    context:  'bursar',
    starters: [
      '📊 Draft a fee reminder message for parents with outstanding balances',
      '💰 Suggest a payment plan structure for struggling families',
      '📄 Write a financial report template for this term',
      '🔍 What are best practices for school fee collection?',
      '✉️ Draft a receipt acknowledgement message for parents',
    ],
  },
  secretary: {
    title:    'AI Admin Assistant',
    subtitle: 'Communications, records, and admin tasks',
    context:  'secretary',
    starters: [
      '📄 Draft a formal admission acceptance letter',
      '📋 Create a checklist for new student enrolment',
      '✉️ Write a circular about the upcoming school sports day',
      '🗓️ Help me structure a school calendar for next term',
      '📝 Draft a certificate of good conduct for a student',
    ],
  },
  parent: {
    title:    'AI Parent Assistant',
    subtitle: 'Support your child\'s education',
    context:  'parent',
    starters: [
      '📚 How can I help my child study better at home?',
      '😟 My child is struggling with Maths — what can I do?',
      '✉️ Help me write a message to my child\'s class teacher',
      '📊 What questions should I ask at a parent-teacher meeting?',
      '🎯 How do I motivate a teenager who has lost interest in school?',
    ],
  },
}

export default function UniversalAIPage({ profile, school, userId, role }: Props) {
  const config      = ROLE_CONFIG[role] ?? ROLE_CONFIG.student
  const storageKey  = `schoolos_ai_${role}_${userId}`
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const bottomRef  = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [storageKey])

  async function sendMessage(text: string) {
    if (!text.trim() || loading) return
    setError('')
    const userMsg: Message = { role: 'user', content: text.trim(), ts: Date.now() }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages:      newHistory.map(m => ({ role: m.role, content: m.content })),
          userId,
          schoolId:      school?.id,
          systemContext: config.context,
        }),
      })
      if (!res.ok) throw new Error()
      const data  = await res.json()
      const reply = data.content?.[0]?.text ?? data.content ?? 'Unable to respond.'
      const updated = [...newHistory, { role: 'assistant' as const, content: reply, ts: Date.now() }]
      setMessages(updated)
      try { localStorage.setItem(storageKey, JSON.stringify(updated.slice(-30))) } catch {}
    } catch { setError('AI is temporarily unavailable. Please try again.') }
    setLoading(false)
  }

  function clearChat() {
    setMessages([])
    try { localStorage.removeItem(storageKey) } catch {}
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <RolePageWrapper userId={userId} role={role} profile={profile} school={school} title={config.title} fullHeight>
      {/* Outer flex column fills the mainFull container */}
      <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>

        {/* Scrollable message area — leaves room for inputBar + bottom nav */}
        <div
          className={styles.messages}
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'auto',
            // On mobile, bottom nav is ~76px (60px pill + 16px gap). InputBar is ~64px.
            // Padding keeps last message visible above both.
            paddingBottom: 'calc(64px + 76px + 8px)',
          }}
        >
          {messages.length === 0 && (
            <div className={styles.welcome}>
              <div className={styles.aiAvatar} style={{ background: schoolColor }}>
                <AiIcon size={28} color="white"/>
              </div>
              <h2>{config.title}</h2>
              <p>{config.subtitle}{school?.name ? ` for ${school.name}` : ''}.</p>
              <div className={styles.starters}>
                {config.starters.map(s => (
                  <button key={s} className={styles.starter}
                    style={{ borderColor: schoolColor + '40' }}
                    onClick={() => sendMessage(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`${styles.msgRow} ${msg.role === 'user' ? styles.userRow : ''}`}>
              {msg.role === 'assistant' && (
                <div className={styles.aiAvatarSm} style={{ background: schoolColor }}>
                  <AiIcon size={14} color="white"/>
                </div>
              )}
              <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.aiBubble}`}
                style={msg.role === 'user' ? { background: schoolColor } : undefined}>
                <div className={styles.bubbleText}
                  dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }}/>
                <span className={styles.bubbleTime}>{formatTime(msg.ts)}</span>
              </div>
            </div>
          ))}

          {loading && (
            <div className={styles.msgRow}>
              <div className={styles.aiAvatarSm} style={{ background: schoolColor }}>
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
            <button className={styles.clearBtn} onClick={clearChat}>
              <RefreshIcon size={16} color="var(--text-muted)"/>
            </button>
          )}
          <textarea className={styles.textarea} value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={`Ask ${config.title.toLowerCase()}…`}
            rows={1}/>
          <button className={styles.sendBtn} style={{ background: schoolColor }}
            onClick={() => sendMessage(input)} disabled={!input.trim() || loading}>
            <SendIcon size={15} color="white"/>
          </button>
        </div>
      </div>
    </RolePageWrapper>
  )
}
