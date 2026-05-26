'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './ai.module.css'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sent_at: string
}

interface Props {
  userId: string
  profile: any
  conversations: any[]
  studentClass: any
}

// Quick prompts to help students get started
const QUICK_PROMPTS = [
  '📚 Explain a topic I am struggling with',
  '📝 Help me prepare for my exam',
  '🧮 Solve this math problem step by step',
  '✍️ Check my assignment answer',
  '⏰ Create a study schedule for me',
  '🔁 Quiz me on my last topic',
]

export default function AITutorClient({ userId, profile, conversations, studentClass }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [messages, setMessages]           = useState<Message[]>([])
  const [input, setInput]                 = useState('')
  const [loading, setLoading]             = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [showHistory, setShowHistory]     = useState(false)
  const [theme, setTheme]                 = useState<'dark' | 'light'>('dark')
  const messagesEndRef                    = useRef<HTMLDivElement>(null)
  const inputRef                          = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
  }

  // Load a past conversation
  async function loadConversation(convId: string) {
    setConversationId(convId)
    setShowHistory(false)

    const { data } = await supabase
      .from('ai_messages')
      .select('id, role, content, sent_at')
      .eq('conversation_id', convId)
      .order('sent_at', { ascending: true })

    setMessages((data ?? []) as Message[])
  }

  // Start a fresh conversation
  function startNewChat() {
    setConversationId(null)
    setMessages([])
    setShowHistory(false)
    inputRef.current?.focus()
  }

  // Build system context for Gemini
  function buildSystemPrompt() {
    const className = studentClass
      ? `${studentClass.level} ${studentClass.section}${studentClass.stream ? ` (${studentClass.stream})` : ''}`
      : 'secondary school'

    return `You are SchoolOS AI Tutor, a helpful and encouraging study assistant for ${profile.full_name}, a ${className} student in Nigeria.

Your personality:
- Warm, patient, and encouraging
- Break complex topics into simple steps
- Use examples relevant to Nigerian curriculum (WAEC, NECO, JAMB)
- Celebrate student progress with positive reinforcement
- Never give answers directly — guide the student to think it through

Your capabilities:
- Explain any subject topic clearly
- Create personalised study schedules
- Quiz students on topics they are studying
- Help structure essay and assignment answers
- Give exam tips and time management advice

Always respond in clear, simple English that a Nigerian secondary school student can understand.`
  }

  // Send message to Gemini API via our secure API route
  async function sendMessage() {
    if (!input.trim() || loading) return

    const userMessage = input.trim()
    setInput('')
    setLoading(true)

    // Add user message to UI immediately
    const tempUserMsg: Message = {
      id:       `temp-user-${Date.now()}`,
      role:     'user',
      content:  userMessage,
      sent_at:  new Date().toISOString(),
    }
    setMessages(prev => [...prev, tempUserMsg])

    try {
      // Create conversation in DB if first message
      let convId = conversationId
      if (!convId) {
        const { data: conv } = await supabase
          .from('ai_conversations')
          .insert({
            user_id:      userId,
            role_context: 'student',
            title:        userMessage.slice(0, 50),
          })
          .select()
          .single()

        if (conv) {
          convId = conv.id
          setConversationId(conv.id)
        }
      }

      // Save user message to DB
      if (convId) {
        await supabase.from('ai_messages').insert({
          conversation_id: convId,
          role:            'user',
          content:         userMessage,
        })
      }

      // Build conversation history for Gemini
      const history = messages
        .filter(m => !m.id.startsWith('temp'))
        .map(m => ({
          role:    m.role === 'user' ? 'user' : 'model',
          parts:   [{ text: m.content }],
        }))

      // Call Gemini API via our secure server route
      const response = await fetch('/api/ai/chat', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          message:      userMessage,
          history:      history,
          systemPrompt: buildSystemPrompt(),
          userId:       userId,
        }),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error ?? 'AI request failed')

      const aiContent = data.response

      // Add AI response to UI
      const aiMsg: Message = {
        id:      `ai-${Date.now()}`,
        role:    'assistant',
        content: aiContent,
        sent_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), tempUserMsg, aiMsg])

      // Save AI response to DB
      if (convId) {
        await supabase.from('ai_messages').insert({
          conversation_id: convId,
          role:            'assistant',
          content:         aiContent,
        })
      }

    } catch (error) {
      // Show error message
      const errMsg: Message = {
        id:      `err-${Date.now()}`,
        role:    'assistant',
        content: 'Sorry, I had trouble responding. Please check your internet connection and try again.',
        sent_at: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errMsg])
    }

    setLoading(false)
  }

  // Auto-resize textarea
  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  return (
    <div className={styles.page}>

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/student')}>←</button>
        <div className={styles.headerCenter}>
          <div className={styles.aiAvatar}>🤖</div>
          <div>
            <p className={styles.aiName}>SchoolOS AI Tutor</p>
            <p className={styles.aiStatus}>
              <span className={styles.onlineDot} />
              Powered by Gemini
            </p>
          </div>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={() => setShowHistory(!showHistory)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3h18v4H3zM3 10h18v4H3zM3 17h18v4H3z"/></svg>
          </button>
          <button className={styles.iconBtn} onClick={toggleTheme}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </div>
      </header>

      {/* History sidebar */}
      {showHistory && (
        <div className={styles.historyPanel}>
          <div className={styles.historyHeader}>
            <p>Past Conversations</p>
            <button onClick={startNewChat} className={styles.newChatBtn}>+ New Chat</button>
          </div>
          {conversations.length === 0 ? (
            <p className={styles.noHistory}>No past conversations yet</p>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                className={styles.historyItem}
                onClick={() => loadConversation(conv.id)}
              >
                <p className={styles.historyTitle}>{conv.title ?? 'Conversation'}</p>
                <p className={styles.historyDate}>
                  {new Date(conv.updated_at).toLocaleDateString()}
                </p>
              </button>
            ))
          )}
        </div>
      )}

      {/* Messages */}
      <div className={styles.messageArea}>

        {/* Welcome screen */}
        {messages.length === 0 && (
          <div className={styles.welcome}>
            <div className={styles.welcomeAvatar}>🤖</div>
            <h2 className={styles.welcomeTitle}>
              Hello, {profile.full_name.split(' ')[0]}! 👋
            </h2>
            <p className={styles.welcomeSubtitle}>
              I am your personal AI study tutor. Ask me anything about your subjects, get help with assignments, or let me create a study plan for you.
            </p>

            {/* Quick prompts */}
            <div className={styles.quickPrompts}>
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  className={styles.quickPrompt}
                  onClick={() => { setInput(prompt.slice(2)); inputRef.current?.focus() }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Message bubbles */}
        {messages.map(msg => (
          <div
            key={msg.id}
            className={`${styles.messageRow} ${msg.role === 'user' ? styles.userRow : styles.aiRow}`}
          >
            {msg.role === 'assistant' && (
              <div className={styles.aiBubbleAvatar}>🤖</div>
            )}
            <div className={`${styles.bubble} ${msg.role === 'user' ? styles.userBubble : styles.aiBubble}`}>
              {/* Render markdown-like formatting */}
              <p className={styles.bubbleText} style={{ whiteSpace: 'pre-wrap' }}>
                {msg.content}
              </p>
              <span className={styles.msgTime}>
                {new Date(msg.sent_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div className={`${styles.messageRow} ${styles.aiRow}`}>
            <div className={styles.aiBubbleAvatar}>🤖</div>
            <div className={`${styles.bubble} ${styles.aiBubble} ${styles.loadingBubble}`}>
              <div className={styles.typingDots}>
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className={styles.inputArea}>
        <div className={styles.inputWrapper}>
          <textarea
            ref={inputRef}
            placeholder="Ask me anything about your studies..."
            value={input}
            onChange={handleInput}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                sendMessage()
              }
            }}
            className={styles.textarea}
            rows={1}
          />
          <button
            className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
            onClick={sendMessage}
            disabled={!input.trim() || loading}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
        <p className={styles.inputHint}>Press Enter to send · Shift+Enter for new line</p>
      </div>

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <a href="/dashboard/student/notes" className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <span>Learn</span>
        </a>
        <a href="/dashboard/student/results" className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <span>Results</span>
        </a>
        <a href="/dashboard/student" className="nav-home">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </a>
        <a href="/dashboard/student/chat" className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Chat</span>
        </a>
        <a href="/dashboard/student/ai" className="nav-item active">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
          <span>AI</span>
        </a>
      </nav>

    </div>
  )
}
