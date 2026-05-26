'use client'

import { useState, useEffect, useRef } from 'react'
import DashboardHeader from '@/components/DashboardHeader'
import StudentNav from '@/components/StudentNav'
import { AiIcon, SendIcon, MicIcon, StopIcon, RefreshIcon } from '@/components/Icons'
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder'
import styles from './ai.module.css'

interface Message {
  role:    'user' | 'assistant'
  content: string
  ts:      number
}

const STARTERS = [
  'Explain photosynthesis simply 🌱',
  'Help me solve quadratic equations 📐',
  'Summarize the Nigerian Civil War 📚',
  'What is the difference between speed and velocity? 🚀',
]

interface Props { profile: any; school: any; userId: string }

export default function AiClient({ profile, school, userId }: Props) {
  const [messages,  setMessages]  = useState<Message[]>([])
  const [input,     setInput]     = useState('')
  const [loading,   setLoading]   = useState(false)
  const [error,     setError]     = useState('')
  const schoolColor = school?.primary_color ?? '#7C3AED'
  const bottomRef   = useRef<HTMLDivElement>(null)
  const inputRef    = useRef<HTMLTextAreaElement>(null)
  const voice       = useVoiceRecorder(60)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Load chat history from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`schoolos_ai_${userId}`)
      if (saved) setMessages(JSON.parse(saved))
    } catch {}
  }, [userId])

  function saveHistory(msgs: Message[]) {
    try {
      // Keep last 30 messages
      localStorage.setItem(`schoolos_ai_${userId}`, JSON.stringify(msgs.slice(-30)))
    } catch {}
  }

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
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newHistory.map(m => ({ role: m.role, content: m.content })),
          userId,
          schoolId: school?.id,
        }),
      })

      if (!res.ok) throw new Error(`AI error: ${res.status}`)
      const data = await res.json()
      const reply = data.content?.[0]?.text ?? data.response ?? 'Sorry, I could not respond.'

      const aiMsg: Message = { role: 'assistant', content: reply, ts: Date.now() }
      const updated = [...newHistory, aiMsg]
      setMessages(updated)
      saveHistory(updated)
    } catch (err: any) {
      setError('AI is temporarily unavailable. Check your connection and try again.')
    }
    setLoading(false)
  }

  async function sendVoiceTranscript() {
    if (!voice.audioBlob) return
    // In production: transcribe with Whisper API or Web Speech API
    // For now, use Web Speech API if available
    setInput('[Voice message — type your question]')
    voice.resetRecording()
    inputRef.current?.focus()
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  function clearChat() {
    setMessages([])
    try { localStorage.removeItem(`schoolos_ai_${userId}`) } catch {}
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className={styles.page}>
      <StudentNav userId={userId} profile={profile} school={school} schoolColor={schoolColor} />

      <div className={styles.content}>
        <DashboardHeader userId={userId} role="student" profile={profile} school={school}
          schoolColor={schoolColor} title="AI Tutor" showBack />

        <div className={styles.chatWrap}>
          {/* Messages */}
          <div className={styles.messages}>
            {messages.length === 0 && (
              <div className={styles.welcome}>
                <div className={styles.aiAvatar} style={{ background: schoolColor }}>
                  <AiIcon size={28} color="white" />
                </div>
                <h2>Hi {profile?.full_name?.split(' ')[0] ?? 'there'} 👋</h2>
                <p>I'm your AI tutor. Ask me anything about your subjects!</p>
                <div className={styles.starters}>
                  {STARTERS.map(s => (
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
                    <AiIcon size={14} color="white" />
                  </div>
                )}
                <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.aiBubble}`}
                  style={msg.role === 'user' ? { background: schoolColor } : undefined}>
                  <div className={styles.bubbleText}
                    dangerouslySetInnerHTML={{ __html: msg.content.replace(/\n/g, '<br/>') }} />
                  <span className={styles.bubbleTime}>{formatTime(msg.ts)}</span>
                </div>
              </div>
            ))}

            {loading && (
              <div className={styles.msgRow}>
                <div className={styles.aiAvatarSm} style={{ background: schoolColor }}>
                  <AiIcon size={14} color="white" />
                </div>
                <div className={styles.aiBubble}>
                  <div className={styles.typingDots}>
                    <span/><span/><span/>
                  </div>
                </div>
              </div>
            )}

            {error && <p className={styles.errorMsg}>{error}</p>}
            <div ref={bottomRef} />
          </div>

          {/* Voice recording */}
          {voice.state === 'recording' && (
            <div className={styles.recordingBar}>
              <div className={styles.recDot} />
              <span>{formatDuration(voice.duration)}</span>
              <div className={styles.recWave}>
                {[...Array(8)].map((_,i)=>(
                  <div key={i} className={styles.recWaveBar} style={{animationDelay:`${i*100}ms`}}/>
                ))}
              </div>
              <button className={styles.recCancel} onClick={voice.cancelRecording}>Cancel</button>
              <button className={styles.recStop} style={{ background: schoolColor }}
                onClick={voice.stopRecording}>
                <StopIcon size={14} color="white" />
              </button>
            </div>
          )}

          {/* Input bar */}
          {voice.state !== 'recording' && (
            <div className={styles.inputBar}>
              {messages.length > 0 && (
                <button className={styles.clearBtn} onClick={clearChat} title="Clear chat">
                  <RefreshIcon size={16} color="var(--text-muted)" />
                </button>
              )}
              <textarea
                ref={inputRef}
                className={styles.textarea}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask me anything about your studies..."
                rows={1}
              />
              <button className={styles.micBtn} onClick={voice.startRecording} title="Voice input">
                <MicIcon size={17} color={schoolColor} />
              </button>
              <button className={styles.sendBtn} style={{ background: schoolColor }}
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading}>
                <SendIcon size={15} color="white" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
