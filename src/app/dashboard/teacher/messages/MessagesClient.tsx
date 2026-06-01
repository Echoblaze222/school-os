'use client'
// src/app/dashboard/teacher/messages/MessagesClient.tsx
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import Link from 'next/link'
import styles from './messages.module.css'
import type { ChatRoom } from './page'

interface Props { userId: string; userName: string; userAvatar: string | null; initialRooms: ChatRoom[] }
interface Message { id: string; room_id: string; sender_id: string; sender_name: string; content: string; created_at: string; is_own?: boolean }

function initials(n: string) { return n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }
function fmtTime(s: string) {
  const d = new Date(s), now = new Date()
  const diff = now.getTime() - d.getTime()
  if (diff < 86400000) return d.toLocaleTimeString('en-NG',{hour:'2-digit',minute:'2-digit'})
  if (diff < 604800000) return d.toLocaleDateString('en-NG',{weekday:'short'})
  return d.toLocaleDateString('en-NG',{day:'numeric',month:'short'})
}

export default function MessagesClient({ userId, userName, userAvatar, initialRooms }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [rooms, setRooms] = useState(initialRooms)
  const [activeRoom, setActiveRoom] = useState<ChatRoom|null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingMsgs, setLoadingMsgs] = useState(false)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const channelRef = useRef<RealtimeChannel|null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { document.documentElement.setAttribute('data-theme', localStorage.getItem('schoolos_theme') ?? 'dark') }, [])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages])
  useEffect(() => {
    const ta = taRef.current; if (!ta) return
    ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 100) + 'px'
  }, [input])

  const loadMessages = useCallback(async (room: ChatRoom) => {
    setLoadingMsgs(true); setMessages([])
    const { data } = await supabase
      .from('chat_messages')
      .select('id, room_id, sender_id, content, created_at, user_profiles(full_name)')
      .eq('room_id', room.id)
      .order('created_at', { ascending: true })
      .limit(100)
    const msgs: Message[] = (data ?? []).map((m: any) => ({
      id: m.id, room_id: m.room_id, sender_id: m.sender_id,
      sender_name: m.user_profiles?.full_name ?? 'User',
      content: m.content, created_at: m.created_at, is_own: m.sender_id === userId,
    }))
    setMessages(msgs); setLoadingMsgs(false)
  }, [supabase, userId])

  const subscribeToRoom = useCallback((roomId: string) => {
    if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null }
    const channel = supabase
      .channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, async (payload) => {
        const m = payload.new as any
        // Fetch sender name if not our own message
        let sender_name = userName
        if (m.sender_id !== userId) {
          const { data } = await supabase.from('user_profiles').select('full_name').eq('id', m.sender_id).maybeSingle()
          sender_name = data?.full_name ?? 'User'
        }
        setMessages(prev => {
          if (prev.find(x => x.id === m.id)) return prev
          return [...prev, { id: m.id, room_id: m.room_id, sender_id: m.sender_id, sender_name, content: m.content, created_at: m.created_at, is_own: m.sender_id === userId }]
        })
        setRooms(prev => prev.map(r => r.id === roomId ? { ...r, last_message: m.content, last_message_at: m.created_at } : r))
      })
      .subscribe()
    channelRef.current = channel
  }, [supabase, userId, userName])

  useEffect(() => { return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) } }, [supabase])

  function openRoom(room: ChatRoom) {
    setActiveRoom(room); loadMessages(room); subscribeToRoom(room.id)
  }

  async function handleSend() {
    if (!input.trim() || !activeRoom || sending) return
    setSending(true)
    const content = input.trim(); setInput('')
    const { error } = await supabase.from('chat_messages').insert({
      room_id: activeRoom.id, sender_id: userId, content,
    })
    if (error) { setInput(content) }
    setSending(false)
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        {activeRoom ? (
          <button onClick={() => { setActiveRoom(null); if(channelRef.current){supabase.removeChannel(channelRef.current);channelRef.current=null} }} className={styles.backBtn} aria-label="Back to rooms">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        ) : (
          <button onClick={() => router.push('/dashboard/teacher')} className={styles.backBtn} aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
        )}
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>{activeRoom ? activeRoom.name : 'Messages'}</h1>
          <p className={styles.subtitle}>{activeRoom ? (activeRoom.type === 'group' ? 'Group chat' : 'Direct message') : `${rooms.length} conversations`}</p>
        </div>
        <div style={{width:38}}/>
      </header>

      {/* Room list view */}
      {!activeRoom && (
        <main className={styles.main}>
          {rooms.length === 0 ? (
            <div className={`glass-card ${styles.emptyState}`}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{opacity:0.4}}><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>
              <p className={styles.emptyTitle}>No conversations yet</p>
              <p className={styles.emptyBody}>Conversations with students and staff will appear here.</p>
            </div>
          ) : (
            <div className={styles.roomList}>
              {rooms.map((room, i) => (
                <button key={room.id} className={`${styles.roomItem} animate-fade-up`} style={{animationDelay:`${i*40}ms`,opacity:0}} onClick={() => openRoom(room)}>
                  <div className={styles.roomAvatar}>
                    {room.type === 'group'
                      ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>
                      : <span>{initials(room.name)}</span>
                    }
                  </div>
                  <div className={styles.roomInfo}>
                    <div className={styles.roomNameRow}>
                      <span className={styles.roomName}>{room.name}</span>
                      {room.last_message_at && <span className={styles.roomTime}>{fmtTime(room.last_message_at)}</span>}
                    </div>
                    <span className={styles.roomPreview}>{room.last_message ?? 'No messages yet'}</span>
                  </div>
                  {room.unread_count > 0 && <span className={styles.unreadBadge}>{room.unread_count}</span>}
                </button>
              ))}
            </div>
          )}
        </main>
      )}

      {/* Chat view */}
      {activeRoom && (
        <div className={styles.chatView}>
          <div className={styles.msgList}>
            {loadingMsgs ? (
              <div className={styles.loadingWrap}><div className={styles.spinner}/></div>
            ) : messages.length === 0 ? (
              <p className={styles.noMessages}>No messages yet. Say hello!</p>
            ) : (
              messages.map(msg => (
                <div key={msg.id} className={`${styles.msgWrap} ${msg.is_own ? styles.msgOwn : styles.msgOther}`}>
                  {!msg.is_own && <div className={styles.msgAvatar}><span>{initials(msg.sender_name)}</span></div>}
                  <div className={styles.msgBubble}>
                    {!msg.is_own && <span className={styles.msgSender}>{msg.sender_name}</span>}
                    <p className={styles.msgContent}>{msg.content}</p>
                    <span className={styles.msgTime}>{fmtTime(msg.created_at)}</span>
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef}/>
          </div>

          {/* Input bar */}
          <div className={styles.inputBar}>
            <textarea
              ref={taRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSend()} }}
              placeholder="Type a message… (Enter to send)"
              rows={1}
              disabled={sending}
              className={styles.msgInput}
            />
            <button onClick={handleSend} disabled={!input.trim()||sending} className={styles.sendBtn} aria-label="Send">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      )}

      <nav className="bottom-nav">
        <Link href="/dashboard/teacher" className="nav-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><span>Home</span></Link>
        <Link href="/dashboard/teacher/results" className="nav-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg><span>Results</span></Link>
        <Link href="/dashboard/teacher" className="nav-home"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/></svg></Link>
        <Link href="/dashboard/teacher/submissions" className="nav-item"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>Grade</span></Link>
        <Link href="/dashboard/teacher/messages" className="nav-item active"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg><span>Messages</span></Link>
      </nav>
    </div>
  )
}
