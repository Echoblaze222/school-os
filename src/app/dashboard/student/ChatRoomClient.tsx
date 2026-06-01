'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './chat.module.css'

interface Message {
  id: string
  content: string | null
  file_url: string | null
  file_type: string | null
  sender_id: string
  sent_at: string
  is_deleted: boolean
  reply_to_id: string | null
}

interface Props {
  roomId: string
  roomTitle: string
  currentUserId: string
  currentUserProfile: any
  initialMessages: Message[]
  members: any[]
}

export default function ChatRoomClient({
  roomId,
  roomTitle,
  currentUserId,
  currentUserProfile,
  initialMessages,
  members,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [messages, setMessages]       = useState<Message[]>(initialMessages)
  const [input, setInput]             = useState('')
  const [sending, setSending]         = useState(false)
  const [replyTo, setReplyTo]         = useState<Message | null>(null)
  const [theme, setTheme]             = useState<'dark' | 'light'>('dark')
  const messagesEndRef                = useRef<HTMLDivElement>(null)
  const inputRef                      = useRef<HTMLInputElement>(null)

  // Build a map of userId -> profile for quick lookups
  const memberMap = members.reduce((acc, m) => {
    const p = m.profiles as any
    if (p) acc[p.id] = p
    return acc
  }, {} as Record<string, any>)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Subscribe to real-time messages via Supabase Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`room:${roomId}`)
      .on(
        'postgres_changes',
        {
          event:  'INSERT',
          schema: 'public',
          table:  'chat_messages',
          filter: `room_id=eq.${roomId}`,
        },
        (payload) => {
          const newMsg = payload.new as Message
          // Avoid duplicates if we already added it optimistically
          setMessages(prev => {
            if (prev.find(m => m.id === newMsg.id)) return prev
            return [...prev, newMsg]
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [roomId])

  // Send a message
  async function sendMessage() {
    if (!input.trim() || sending) return

    setSending(true)
    const content = input.trim()
    setInput('')

    const newMsg: any = {
      room_id:     roomId,
      sender_id:   currentUserId,
      content:     content,
      reply_to_id: replyTo?.id ?? null,
    }

    // Optimistic update — show message immediately
    const tempMsg: Message = {
      id:          `temp-${Date.now()}`,
      content:     content,
      file_url:    null,
      file_type:   null,
      sender_id:   currentUserId,
      sent_at:     new Date().toISOString(),
      is_deleted:  false,
      reply_to_id: replyTo?.id ?? null,
    }
    setMessages(prev => [...prev, tempMsg])
    setReplyTo(null)

    const { error } = await supabase
      .from('chat_messages')
      .insert(newMsg)

    if (error) {
      // Remove optimistic message if it failed
      setMessages(prev => prev.filter(m => m.id !== tempMsg.id))
      setInput(content)
    }

    setSending(false)
    inputRef.current?.focus()
  }

  // Delete a message (soft delete)
  async function deleteMessage(msgId: string) {
    await supabase
      .from('chat_messages')
      .update({ is_deleted: true, content: null })
      .eq('id', msgId)
      .eq('sender_id', currentUserId)

    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, is_deleted: true, content: null } : m
    ))
  }

  // Format timestamp for message
  function formatMsgTime(timestamp: string) {
    return new Date(timestamp).toLocaleTimeString([], {
      hour:   '2-digit',
      minute: '2-digit',
    })
  }

  // Format date separator
  function formatDateSeparator(timestamp: string) {
    const date = new Date(timestamp)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString([], { day: 'numeric', month: 'long', year: 'numeric' })
  }

  // Check if we should show a date separator
  function shouldShowDate(index: number) {
    if (index === 0) return true
    const prev = messages[index - 1]
    const curr = messages[index]
    return new Date(prev.sent_at).toDateString() !== new Date(curr.sent_at).toDateString()
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
  }

  return (
    <div className={styles.chatRoom}>

      {/* Header */}
      <header className={styles.roomHeader}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/student/chat')}>
          ←
        </button>
        <div className={styles.roomInfo}>
          <div className={styles.roomAvatar}>
            <span>{roomTitle[0]?.toUpperCase()}</span>
          </div>
          <div>
            <p className={styles.roomName}>{roomTitle}</p>
            <p className={styles.roomStatus}>
              {members.length} member{members.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
        <button className={styles.iconBtn} onClick={toggleTheme}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      {/* Messages */}
      <div className={styles.messageArea}>
        {messages.length === 0 && (
          <div className={styles.emptyChat}>
            <p>💬</p>
            <p>No messages yet. Say hello!</p>
          </div>
        )}

        {messages.map((msg, index) => {
          const isMe = msg.sender_id === currentUserId
          const sender = memberMap[msg.sender_id]
          const senderName = sender?.full_name ?? 'Unknown'

          return (
            <div key={msg.id}>
              {/* Date separator */}
              {shouldShowDate(index) && (
                <div className={styles.dateSeparator}>
                  <span>{formatDateSeparator(msg.sent_at)}</span>
                </div>
              )}

              {/* Message bubble */}
              <div className={`${styles.messageRow} ${isMe ? styles.myRow : styles.theirRow}`}>
                {/* Avatar (only for others) */}
                {!isMe && (
                  <div className={styles.msgAvatar}>
                    {sender?.avatar_url
                      ? <img src={sender.avatar_url} alt={senderName} />
                      : <span>{senderName[0]?.toUpperCase()}</span>
                    }
                  </div>
                )}

                <div className={`${styles.bubble} ${isMe ? styles.myBubble : styles.theirBubble}`}>
                  {/* Sender name (for group chats) */}
                  {!isMe && (
                    <p className={styles.bubbleSender}>{senderName}</p>
                  )}

                  {/* Reply preview */}
                  {msg.reply_to_id && (
                    <div className={styles.replyPreview}>
                      <p>↩ Replied to a message</p>
                    </div>
                  )}

                  {/* Message content */}
                  {msg.is_deleted ? (
                    <p className={styles.deletedMsg}>🚫 This message was deleted</p>
                  ) : (
                    <p className={styles.bubbleText}>{msg.content}</p>
                  )}

                  {/* Timestamp + actions */}
                  <div className={styles.bubbleFooter}>
                    <span className={styles.msgTime}>{formatMsgTime(msg.sent_at)}</span>
                    {isMe && !msg.is_deleted && (
                      <span className={styles.readTick}>✓✓</span>
                    )}
                  </div>
                </div>

                {/* Message actions (reply/delete) */}
                {!msg.is_deleted && (
                  <div className={`${styles.msgActions} ${isMe ? styles.myActions : styles.theirActions}`}>
                    <button
                      className={styles.msgActionBtn}
                      onClick={() => setReplyTo(msg)}
                      title="Reply"
                    >
                      ↩
                    </button>
                    {isMe && (
                      <button
                        className={styles.msgActionBtn}
                        onClick={() => deleteMessage(msg.id)}
                        title="Delete"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Reply preview bar */}
      {replyTo && (
        <div className={styles.replyBar}>
          <div className={styles.replyBarContent}>
            <span className={styles.replyBarIcon}>↩</span>
            <div>
              <p className={styles.replyBarName}>
                {replyTo.sender_id === currentUserId ? 'You' : memberMap[replyTo.sender_id]?.full_name}
              </p>
              <p className={styles.replyBarText}>{replyTo.content}</p>
            </div>
          </div>
          <button className={styles.replyBarClose} onClick={() => setReplyTo(null)}>✕</button>
        </div>
      )}

      {/* Input bar */}
      <div className={styles.inputBar}>
        <input
          ref={inputRef}
          type="text"
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          className={styles.messageInput}
        />
        <button
          className={`${styles.sendBtn} ${input.trim() ? styles.sendBtnActive : ''}`}
          onClick={sendMessage}
          disabled={!input.trim() || sending}
        >
          {sending ? '...' : '➤'}
        </button>
      </div>

    </div>
  )
}
