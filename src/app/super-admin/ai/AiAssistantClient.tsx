'use client'
// src/app/super-admin/ai/AiAssistantClient.tsx
// Standalone chat UI, not the shared UniversalAIPage component - that
// component is tightly coupled to RolePageWrapper/RoleNav, which don't
// know about super_admin and would render broken/duplicate chrome
// alongside the SuperAdminShell sidebar this page already sits inside.

import { useState, useRef, useEffect } from 'react'
import { SendIcon, RefreshIcon } from '@/components/Icons'
import styles from './ai.module.css'

interface Message { role: 'user' | 'assistant'; content: string; ts: number }

const STARTERS = [
  'How much revenue came in this month?',
  'Which schools are expiring soon?',
  'Extend a school\'s trial',
]

// Turns [[label|href]] markers and **bold** into real markup. Deliberately
// much smaller than UniversalAIPage's parser (no numbered-step walkthrough,
// no headings/bullets) - this is an ops tool, plain replies are fine.
function renderContent(content: string): string {
  const escaped = content
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return escaped
    .replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, '<a href="$2">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>')
}

export default function AiAssistantClient({ adminName }: { adminName: string }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input,    setInput]    = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const idCounter = useRef(0)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function send(text: string) {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    const nextMessages = [...messages, { role: 'user' as const, content: trimmed, ts: ++idCounter.current }]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: 'super_admin',
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error ?? 'Something went wrong.')

      const replyText = data?.content?.[0]?.text ?? '(No response.)'
      setMessages(m => [...m, { role: 'assistant', content: replyText, ts: ++idCounter.current }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>AI Assistant</h1>
        <p className={styles.sub}>Ask about the platform, or tell it to extend a trial, confirm a payment, or suspend a school.</p>
      </div>

      <div className={styles.chatArea}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            <p className={styles.emptyGreeting}>Hi {adminName.split(' ')[0]} - what do you need?</p>
            <div className={styles.starters}>
              {STARTERS.map(s => (
                <button key={s} className={styles.starterBtn} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? styles.userBubble : styles.assistantBubble}>
            <div dangerouslySetInnerHTML={{ __html: renderContent(m.content) }} />
          </div>
        ))}

        {loading && (
          <div className={styles.assistantBubble}>
            <div className={styles.typingDots}><span /><span /><span /></div>
          </div>
        )}

        {error && <div className={styles.errorBox}>{error}</div>}
        <div ref={bottomRef} />
      </div>

      <form className={styles.inputBar} onSubmit={e => { e.preventDefault(); send(input) }}>
        <button type="button" className={styles.resetBtn} onClick={() => setMessages([])} title="New conversation">
          <RefreshIcon size={16} />
        </button>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask or tell the assistant to do something..."
          className={styles.input}
        />
        <button type="submit" className={styles.sendBtn} disabled={loading || !input.trim()}>
          <SendIcon size={16} color="white" />
        </button>
      </form>
    </div>
  )
}
