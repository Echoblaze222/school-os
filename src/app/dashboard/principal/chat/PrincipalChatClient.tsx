'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './principal-chat.module.css'

interface Message {
  id: string
  content: string | null
  sender_id: string
  sent_at: string
  is_deleted: boolean
}

interface Props {
  currentUserId:   string
  currentProfile:  any
  memberships:     any[]
  allPrincipals:   any[]
}

export default function PrincipalChatClient({
  currentUserId, currentProfile, memberships, allPrincipals,
}: Props) {
  const router   = useRouter()
  const supabase = createClient()

  const [view,       setView]       = useState<'list' | 'room'>('list')
  const [activeRoom, setActiveRoom] = useState<string | null>(null)
  const [messages,   setMessages]   = useState<Message[]>([])
  const [otherUser,  setOtherUser]  = useState<any>(null)
  const [input,      setInput]      = useState('')
  const [sending,    setSending]    = useState(false)
  const [search,     setSearch]     = useState('')
  const [tab,        setTab]        = useState<'conversations' | 'discover'>('conversations')
  const [theme,      setTheme]      = useState<'dark' | 'light'>('dark')
  const [creating,   setCreating]   = useState(false)
  const messagesEndRef               = useRef<HTMLDivElement>(null)
  const inputRef                     = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as any
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Subscribe to real-time messages when in a room
  useEffect(() => {
    if (!activeRoom) return

    const channel = supabase
      .channel(`principal-room:${activeRoom}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'chat_messages',
        filter: `room_id=eq.${activeRoom}`,
      }, (payload) => {
        const m = payload.new as Message
        setMessages(prev => {
          // FIX: Deduplicate — skip if ID already exists (added directly after insert)
          if (prev.find(x => x.id === m.id)) return prev
          return [...prev, m]
        })
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [activeRoom])

  async function openRoom(roomId: string, other: any) {
    setActiveRoom(roomId)
    setOtherUser(other)
    setView('room')

    // Load messages
    const { data } = await supabase
      .from('chat_messages')
      .select('id, content, sender_id, sent_at, is_deleted')
      .eq('room_id', roomId)
      .order('sent_at', { ascending: true })
      .limit(50)

    setMessages(data ?? [])
    setTimeout(() => inputRef.current?.focus(), 100)
  }

  // FIX: Resolve the other user from membership data before opening room
  async function openRoomFromMembership(membership: any) {
    const roomId = membership.room_id

    // Try to resolve the other participant from the room's members
    const { data: roomMembers } = await supabase
      .from('chat_room_members')
      .select('user:profiles(id, full_name, avatar_url, role, schools(name, primary_color))')
      .eq('room_id', roomId)
      .neq('user_id', currentUserId)
      .limit(1)
      .maybeSingle()

    const resolvedOther = (roomMembers as any)?.user ?? null
    await openRoom(roomId, resolvedOther)
  }

  async function startNewChat(principal: any) {
    setCreating(true)

    // Check if room already exists
    const myRoomIds = memberships.map(m => m.room_id)

    if (myRoomIds.length > 0) {
      const { data: shared } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', principal.id)
        .in('room_id', myRoomIds)

      if (shared && shared.length > 0) {
        await openRoom(shared[0].room_id, principal)
        setCreating(false)
        return
      }
    }

    // Create new room
    const { data: room } = await supabase
      .from('chat_rooms')
      .insert({
        room_type:  'principal_to_principal',
        is_group:   false,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (!room) { setCreating(false); return }

    await supabase.from('chat_room_members').insert([
      { room_id: room.id, user_id: currentUserId },
      { room_id: room.id, user_id: principal.id },
    ])

    setCreating(false)
    await openRoom(room.id, principal)
  }

  async function sendMessage() {
    if (!input.trim() || !activeRoom || sending) return

    const content = input.trim()
    const tempId  = `temp-${Date.now()}`
    setInput('')
    setSending(true)

    // Optimistic update with temp ID
    const temp: Message = {
      id:         tempId,
      content,
      sender_id:  currentUserId,
      sent_at:    new Date().toISOString(),
      is_deleted: false,
    }
    setMessages(prev => [...prev, temp])

    // FIX: Use .select().single() to get real row back and replace temp
    const { data: newMsg, error } = await supabase
      .from('chat_messages')
      .insert({ room_id: activeRoom, sender_id: currentUserId, content })
      .select('id, content, sender_id, sent_at, is_deleted')
      .single()

    if (error) {
      // Roll back on error
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setInput(content)
    } else if (newMsg) {
      // FIX: Replace temp with real message to prevent subscription duplicate
      setMessages(prev => prev.map(m => m.id === tempId ? newMsg as Message : m))
    }

    setSending(false)
    inputRef.current?.focus()
  }

  function formatTime(d: string) {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function getLastMessage(membership: any) {
    const msgs = membership.chat_rooms?.chat_messages ?? []
    if (msgs.length === 0) return 'No messages yet'
    const last = msgs[msgs.length - 1]
    return last.sender_id === currentUserId
      ? `You: ${last.content ?? 'Sent a message'}`
      : last.content ?? 'Sent a message'
  }

  const filteredPrincipals = allPrincipals.filter(p => {
    const school = (p.schools as any)
    const name   = p.full_name?.toLowerCase() ?? ''
    const sname  = school?.name?.toLowerCase() ?? ''
    const q      = search.toLowerCase()
    return !search || name.includes(q) || sname.includes(q)
  })

  // ── ROOM VIEW ──
  if (view === 'room' && activeRoom) {
    const school = otherUser?.schools as any

    return (
      <div className={styles.chatRoom}>
        <header className={styles.roomHeader}>
          <button className={styles.backBtn} onClick={() => { setView('list'); setActiveRoom(null) }}>←</button>
          <div className={styles.roomInfo}>
            <div className={styles.roomAvatar} style={{ background: school?.primary_color ?? '#800020' }}>
              {otherUser?.avatar_url
                ? <img src={otherUser.avatar_url} alt="" />
                : <span>{otherUser?.full_name?.[0]?.toUpperCase() ?? '?'}</span>
              }
            </div>
            <div>
              <p className={styles.roomName}>{otherUser?.full_name ?? 'Conversation'}</p>
              <p className={styles.roomSub}>🏫 {school?.name ?? 'Principal'}</p>
            </div>
          </div>
          <button className={styles.iconBtn} onClick={() => {
            const next = theme === 'dark' ? 'light' : 'dark'
            setTheme(next); localStorage.setItem('schoolos_theme', next)
            document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
          }}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
        </header>

        <div className={styles.messageArea}>
          {messages.length === 0 && (
            <div className={styles.emptyChat}>
              <p>💬</p>
              <p>Start the conversation with {otherUser?.full_name?.split(' ')[0] ?? 'them'}</p>
            </div>
          )}

          {messages.map(msg => {
            const isMe = msg.sender_id === currentUserId
            return (
              <div key={msg.id} className={`${styles.msgRow} ${isMe ? styles.myRow : styles.theirRow}`}>
                <div className={`${styles.bubble} ${isMe ? styles.myBubble : styles.theirBubble}`}>
                  {msg.is_deleted
                    ? <p className={styles.deleted}>🚫 Deleted</p>
                    : <p className={styles.bubbleText}>{msg.content}</p>
                  }
                  <span className={styles.msgTime}>{formatTime(msg.sent_at)}</span>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

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
            ➤
          </button>
        </div>
      </div>
    )
  }

  // ── LIST VIEW ──
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/principal')}>←</button>
        <h1 className={styles.headerTitle}>Principal Network</h1>
        <button className={styles.iconBtn} onClick={() => {
          const next = theme === 'dark' ? 'light' : 'dark'
          setTheme(next); localStorage.setItem('schoolos_theme', next)
          document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
        }}>
          {theme === 'dark' ? '☀️' : '🌙'}
        </button>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${tab === 'conversations' ? styles.tabActive : ''}`}
          onClick={() => setTab('conversations')}
        >
          💬 Conversations
          {memberships.length > 0 && (
            <span className={styles.tabCount}>{memberships.length}</span>
          )}
        </button>
        <button
          className={`${styles.tab} ${tab === 'discover' ? styles.tabActive : ''}`}
          onClick={() => setTab('discover')}
        >
          🌐 Discover Principals
          <span className={styles.tabCount}>{allPrincipals.length}</span>
        </button>
      </div>

      {/* Search */}
      <div className={styles.searchBar}>
        <span>🔍</span>
        <input
          type="text"
          placeholder={tab === 'conversations' ? 'Search conversations...' : 'Search principals or schools...'}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Conversations list */}
      {tab === 'conversations' && (
        <div className={styles.list}>
          {memberships.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyEmoji}>🤝</p>
              <p className={styles.emptyTitle}>No conversations yet</p>
              <p className={styles.emptyHint}>
                Connect with principals from other schools on the Discover tab
              </p>
              <button
                className="btn btn-primary"
                onClick={() => setTab('discover')}
                style={{ marginTop: '16px' }}
              >
                Discover Principals →
              </button>
            </div>
          ) : (
            memberships
              .filter(m => {
                const room = m.chat_rooms
                return !search || room?.name?.toLowerCase().includes(search.toLowerCase())
              })
              .map(membership => {
                const room = membership.chat_rooms
                return (
                  <button
                    key={membership.room_id}
                    className={styles.chatItem}
                    // FIX: was passing null for otherUser — now resolves it from DB
                    onClick={() => openRoomFromMembership(membership)}
                  >
                    <div className={styles.chatAvatar}>
                      <span>{(room?.name ?? 'P')[0]?.toUpperCase()}</span>
                    </div>
                    <div className={styles.chatContent}>
                      <div className={styles.chatTop}>
                        <span className={styles.chatName}>{room?.name ?? 'Conversation'}</span>
                        <span className={styles.chatTime}>
                          {room?.chat_messages?.length > 0
                            ? formatTime(room.chat_messages[room.chat_messages.length - 1].sent_at)
                            : ''}
                        </span>
                      </div>
                      <p className={styles.chatPreview}>{getLastMessage(membership)}</p>
                    </div>
                  </button>
                )
              })
          )}
        </div>
      )}

      {/* Discover tab */}
      {tab === 'discover' && (
        <div className={styles.list}>
          <p className={styles.discoverNote}>
            🌐 Connect with principals from other schools on SchoolOS
          </p>

          {filteredPrincipals.length === 0 ? (
            <div className={styles.empty}>
              <p className={styles.emptyEmoji}>👤</p>
              <p className={styles.emptyTitle}>No principals found</p>
            </div>
          ) : (
            filteredPrincipals.map(principal => {
              const school = (principal.schools as any)
              return (
                <div key={principal.id} className={styles.principalCard}>
                  <div className={styles.principalAvatar} style={{ background: school?.primary_color ?? '#800020' }}>
                    {principal.avatar_url
                      ? <img src={principal.avatar_url} alt="" />
                      : <span>{principal.full_name?.[0]?.toUpperCase()}</span>
                    }
                  </div>
                  <div className={styles.principalInfo}>
                    <p className={styles.principalName}>{principal.full_name}</p>
                    <p className={styles.principalSchool}>🏫 {school?.name ?? 'Unknown School'}</p>
                    {(school?.city || school?.state) && (
                      <p className={styles.principalLocation}>
                        📍 {[school.city, school.state].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <button
                    className={styles.messageBtn}
                    onClick={() => startNewChat(principal)}
                    disabled={creating}
                  >
                    {creating ? '⏳' : '💬 Message'}
                  </button>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <a href="/dashboard/principal/students" className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>👥</span><span>Students</span>
        </a>
        <a href="/dashboard/principal/fees" className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>💰</span><span>Fees</span>
        </a>
        <a href="/dashboard/principal" className="nav-home">
          <span style={{ fontSize: '1.3rem' }}>🏠</span>
        </a>
        <a href="/dashboard/principal/chat" className="nav-item active">
          <span style={{ fontSize: '1.2rem' }}>💬</span><span>Chat</span>
        </a>
        <a href="/dashboard/principal/ai" className="nav-item">
          <span style={{ fontSize: '1.2rem' }}>🧠</span><span>AI</span>
        </a>
      </nav>
    </div>
  )
    }
      
