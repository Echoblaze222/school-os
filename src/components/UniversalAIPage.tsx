'use client'
// components/UniversalAIPage.tsx
// Shared AI assistant page used by every role dashboard.
// Each role gets its own starters, system context, and local-storage key.

import { useState, useEffect, useRef } from 'react'
import RolePageWrapper from '@/components/RolePageWrapper'
import { AiIcon, SendIcon, RefreshIcon, PaperclipIcon, XIcon } from '@/components/Icons'
import { createClient } from '@/lib/supabase/client'
import styles from '@/app/dashboard/student/ai/ai.module.css'

interface Message { role: 'user' | 'assistant'; content: string; ts: number; imageUrl?: string | null }
interface Props   { profile: any; school: any; userId: string; role: string }

const MAX_IMAGE_BYTES = 5 * 1024 * 1024 // 5MB — keeps rows small and uploads fast on mobile data

function fileToBase64(file: File): Promise<{ data: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const [, base64] = result.split(',')
      resolve({ data: base64, mediaType: file.type })
    }
    reader.onerror = () => reject(new Error('Could not read image'))
    reader.readAsDataURL(file)
  })
}

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
  const [historyLoaded, setHistoryLoaded] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [pendingImage, setPendingImage] = useState<{ data: string; mediaType: string; previewUrl: string } | null>(null)
  const [imageError, setImageError] = useState('')
  const bottomRef  = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Instant paint from local cache, then reconcile with the server so
  // history follows the person across devices/sessions like a normal AI app.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setMessages(JSON.parse(saved))
    } catch {}

    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/ai/history?role=${encodeURIComponent(role)}`)
        if (!res.ok) return
        const data = await res.json()
        if (cancelled) return
        setConversationId(data.conversation_id ?? null)
        if (Array.isArray(data.messages) && data.messages.length > 0) {
          const restored: Message[] = data.messages.map((m: any) => ({
            role:     m.role,
            content:  m.content,
            ts:       new Date(m.sent_at).getTime(),
            imageUrl: m.image_url ?? null,
          }))
          setMessages(restored)
          try { localStorage.setItem(storageKey, JSON.stringify(restored.slice(-30))) } catch {}
        }
      } catch {
        // Offline or first load — the local cache (if any) already rendered above.
      } finally {
        if (!cancelled) setHistoryLoaded(true)
      }
    })()

    return () => { cancelled = true }
  }, [storageKey, role])

  function handleAttachClick() {
    setImageError('')
    fileInputRef.current?.click()
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImageError('')
    if (!file.type.startsWith('image/')) { setImageError('Please choose an image file.'); return }
    if (file.size > MAX_IMAGE_BYTES) { setImageError('Image is too large (max 5MB).'); return }
    try {
      const { data, mediaType } = await fileToBase64(file)
      setPendingImage({ data, mediaType, previewUrl: `data:${mediaType};base64,${data}` })
    } catch {
      setImageError('Could not read that image. Try another file.')
    }
  }

  function removePendingImage() {
    setPendingImage(null)
    setImageError('')
  }

  async function sendMessage(text: string) {
    if ((!text.trim() && !pendingImage) || loading) return
    setError('')
    const userMsg: Message = {
      role: 'user',
      content: text.trim() || '📷 Sent an image',
      ts: Date.now(),
      imageUrl: pendingImage?.previewUrl ?? null,
    }
    const newHistory = [...messages, userMsg]
    setMessages(newHistory)
    setInput('')
    const imageToSend = pendingImage
    setPendingImage(null)
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
          conversationId,
          image: imageToSend ? { data: imageToSend.data, mediaType: imageToSend.mediaType } : undefined,
        }),
      })
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'You\'re sending messages too fast. Please wait a moment and try again.')
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error()
      const data  = await res.json()
      if (data.conversation_id) setConversationId(data.conversation_id)
      const reply = data.content?.[0]?.text ?? data.content ?? 'Unable to respond.'
      const updated = [...newHistory, { role: 'assistant' as const, content: reply, ts: Date.now() }]
      setMessages(updated)
      try { localStorage.setItem(storageKey, JSON.stringify(updated.slice(-30))) } catch {}
    } catch { setError('AI is temporarily unavailable. Please try again.') }
    setLoading(false)
  }

  function clearChat() {
    const idToArchive = conversationId
    setMessages([])
    setConversationId(null)
    try { localStorage.removeItem(storageKey) } catch {}
    // Archive (don't delete) the old conversation server-side so a clean
    // thread starts next message, while history is still recoverable.
    if (idToArchive) {
      const supabase = createClient()
      supabase.from('ai_conversations').update({ is_archived: true }).eq('id', idToArchive)
        .then(({ error }) => { if (error) console.warn('[AI] Failed to archive conversation:', error.message) })
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input) }
  }

  function formatTime(ts: number) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // Escape before converting newlines to <br/> — msg.content can come from
  // the model or from student/parent free text, neither of which is trusted HTML.
  function safeContentHtml(content: string) {
    const escaped = content
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
    return escaped.replace(/\n/g, '<br/>')
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
          {messages.length === 0 && historyLoaded && (
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
                {msg.imageUrl && (
                  <img src={msg.imageUrl} alt="Attached" className={styles.attachedImage}/>
                )}
                <div className={styles.bubbleText}
                  dangerouslySetInnerHTML={{ __html: safeContentHtml(msg.content) }}/>
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

        {pendingImage && (
          <div className={styles.imagePreviewBar}>
            <img src={pendingImage.previewUrl} alt="Selected" className={styles.imagePreviewThumb}/>
            <span className={styles.imagePreviewLabel}>Image attached</span>
            <button className={styles.imagePreviewRemove} onClick={removePendingImage}>
              <XIcon size={13} color="var(--text-muted)"/>
            </button>
          </div>
        )}
        {imageError && <p className={styles.errorMsg}>{imageError}</p>}

        <div className={`${styles.inputBar} ${styles.inputBarFloating}`}>
          {messages.length > 0 && (
            <button className={styles.clearBtn} onClick={clearChat} title="Clear chat">
              <RefreshIcon size={16} color="var(--text-muted)"/>
            </button>
          )}
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={handleFileSelected}/>
          <button className={styles.clearBtn} onClick={handleAttachClick} title="Attach an image">
            <PaperclipIcon size={16} color="var(--text-muted)"/>
          </button>
          <textarea className={styles.textarea} value={input}
            onChange={e => setInput(e.target.value)} onKeyDown={handleKey}
            placeholder={pendingImage ? 'Ask something about this image…' : `Ask ${config.title.toLowerCase()}…`}
            rows={1}/>
          <button className={styles.sendBtn} style={{ background: schoolColor }}
            onClick={() => sendMessage(input)} disabled={(!input.trim() && !pendingImage) || loading}>
            <SendIcon size={15} color="white"/>
          </button>
        </div>
      </div>
    </RolePageWrapper>
  )
}
