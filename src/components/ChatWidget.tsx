'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageIcon, SendIcon, PaperclipIcon, XIcon } from './Icons'
import styles from './ChatWidget.module.css'

// ── Types ─────────────────────────────────────────────────
interface Message {
  id:         string
  content:    string   // correct field — NOT 'body'
  sender_id:  string
  sent_at:    string   // correct field — NOT 'created_at'
  file_type?: string | null
  file_url?:  string | null
  is_deleted: boolean
}

interface Room {
  id:   string
  name: string
}

interface Props {
  userId:       string
  role:         string
  schoolColor?: string
}

// ── Component ──────────────────────────────────────────────
export default function ChatWidget({ userId, role, schoolColor = '#7C3AED' }: Props) {
  const [open,       setOpen]       = useState(false)
  const [rooms,      setRooms]      = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [messages,   setMessages]   = useState<Message[]>([])
  const [text,       setText]       = useState('')
  const [sending,    setSending]    = useState(false)
  const [unread,     setUnread]     = useState(0)

  const supabase  = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  // Load rooms on mount
  useEffect(() => { loadRooms() }, [userId])

  // Subscribe to new messages in active room
  useEffect(() => {
    if (!activeRoom) return
    loadMessages(activeRoom.id)

    const ch = supabase.channel(`widget:${activeRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'chat_messages',            // ✅ correct table
        filter: `room_id=eq.${activeRoom.id}`,
      }, async payload => {
        const { data: msg } = await supabase
          .from('chat_messages')
          .select('id, content, sender_id, sent_at, file_type, file_url, is_deleted')
          .eq('id', payload.new.id)
          .single()
        if (msg) {
          setMessages(prev => {
            if (prev.find(x => x.id === (msg as Message).id)) return prev
            return [...prev, msg as Message]
          })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [activeRoom])

  // Track unread when widget is closed
  useEffect(() => {
    if (open) { setUnread(0); return }
    const ch = supabase.channel(`widget-unread:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
      }, payload => {
        if ((payload.new as any).sender_id !== userId) {
          setUnread(prev => prev + 1)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [open, userId])

  // Scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Load rooms (flat queries — no nested joins) ──────────
  async function loadRooms() {
    const { data: memberships } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', userId)

    if (!memberships?.length) return

    const roomIds = memberships.map((m: any) => m.room_id)

    const { data: roomsData } = await supabase
      .from('chat_rooms')
      .select('id, name, is_group')
      .in('id', roomIds)

    if (!roomsData?.length) return

    // For DM rooms, get the other user's name
    const result: Room[] = await Promise.all(
      roomsData.map(async (room: any) => {
        if (room.is_group) return { id: room.id, name: room.name ?? 'Group' }

        const { data: other } = await supabase
          .from('chat_room_members')
          .select('user:profiles(full_name)')
          .eq('room_id', room.id)
          .neq('user_id', userId)
          .limit(1)
          .single()

        const otherName = (other as any)?.user?.full_name ?? room.name ?? 'Chat'
        return { id: room.id, name: otherName }
      })
    )

    // Deduplicate by room id — prevents showing duplicates
    const seen = new Set<string>()
    const unique = result.filter(r => {
      if (seen.has(r.id)) return false
      seen.add(r.id)
      return true
    })

    setRooms(unique)
  }

  // ── Load messages ────────────────────────────────────────
  async function loadMessages(roomId: string) {
    const { data } = await supabase
      .from('chat_messages')                        // ✅ correct table
      .select('id, content, sender_id, sent_at, file_type, file_url, is_deleted')
      .eq('room_id', roomId)
      .order('sent_at', { ascending: true })        // ✅ correct field
      .limit(50)
    if (data) setMessages(data as Message[])
  }

  // ── Send text ────────────────────────────────────────────
  async function sendText() {
    if (!text.trim() || !activeRoom || sending) return
    setSending(true)
    const content = text.trim()
    const tempId  = `temp-${Date.now()}`
    setText('')

    // Optimistic update
    setMessages(prev => [...prev, {
      id: tempId, content, sender_id: userId,
      sent_at: new Date().toISOString(), is_deleted: false,
    }])

    const { data: newMsg, error } = await supabase
      .from('chat_messages')
      .insert({ room_id: activeRoom.id, sender_id: userId, content })
      .select('id, content, sender_id, sent_at, file_type, file_url, is_deleted')
      .single()

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setText(content)
    } else if (newMsg) {
      setMessages(prev => prev.map(m => m.id === tempId ? newMsg as Message : m))
    }
    setSending(false)
  }

  // ── Send file ────────────────────────────────────────────
  async function sendFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeRoom || sending) return
    setSending(true)

    const ext     = file.name.split('.').pop()
    const isImage = file.type.startsWith('image/')
    const bucket  = isImage ? 'chat-images' : 'chat-files'
    const fname   = `files/${userId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage.from(bucket).upload(fname, file)
    if (uploadError) { e.target.value = ''; setSending(false); return }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fname)
    const content = isImage ? '🖼️ Image' : `📎 ${file.name}`

    const { data: newMsg } = await supabase
      .from('chat_messages')
      .insert({ room_id: activeRoom.id, sender_id: userId, content, file_url: urlData.publicUrl, file_type: isImage ? 'image' : 'file' })
      .select('id, content, sender_id, sent_at, file_type, file_url, is_deleted')
      .single()

    if (newMsg) {
      setMessages(prev => {
        if (prev.find(x => x.id === (newMsg as Message).id)) return prev
        return [...prev, newMsg as Message]
      })
    }
    e.target.value = ''
    setSending(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  function formatTime(d: string) {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  // ── Render ───────────────────────────────────────────────
  return (
    <div className={styles.container}>

      {/* FAB button */}
      <button
        className={styles.fab}
        style={{ background: schoolColor }}
        onClick={() => setOpen(!open)}
        aria-label="Open messages"
      >
        {open
          ? <XIcon size={18} color="white" />
          : <MessageIcon size={20} color="white" />
        }
        {unread > 0 && (
          <span className={styles.fabBadge}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className={styles.panel}>

          {/* Header */}
          <div className={styles.header} style={{ background: schoolColor }}>
            {activeRoom ? (
              <>
                <button className={styles.backBtn}
                  onClick={() => { setActiveRoom(null); setMessages([]) }}>
                  ←
                </button>
                <div>
                  <p className={styles.headerTitle}>{activeRoom.name}</p>
                  <p className={styles.headerSub}>Active</p>
                </div>
              </>
            ) : (
              <>
                <MessageIcon size={16} color="white" />
                <p className={styles.headerTitle}>Messages</p>
              </>
            )}
          </div>

          {/* Room list */}
          {!activeRoom && (
            <div className={styles.roomList}>
              {rooms.length === 0 ? (
                <div className={styles.emptyRooms}>
                  <MessageIcon size={28} color="var(--text-faint)" />
                  <p>No chats yet</p>
                </div>
              ) : (
                rooms.map(room => (
                  <button
                    key={room.id}
                    className={styles.roomItem}
                    onClick={() => setActiveRoom(room)}
                  >
                    <div className={styles.roomAvatar} style={{ background: schoolColor }}>
                      <span style={{ color: '#fff', fontWeight: 700 }}>
                        {room.name[0]?.toUpperCase()}
                      </span>
                    </div>
                    <span className={styles.roomName}>{room.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>→</span>
                  </button>
                ))
              )}
              <a href={`/dashboard/${role}/chat`} className={styles.viewAllChats}>
                Open full chat →
              </a>
            </div>
          )}

          {/* Messages */}
          {activeRoom && (
            <>
              <div className={styles.messages}>
                {messages.length === 0 && (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '24px' }}>
                    No messages yet. Say hello! 👋
                  </div>
                )}
                {messages.map(msg => {
                  const isMe = msg.sender_id === userId
                  return (
                    <div key={msg.id} className={`${styles.msgRow} ${isMe ? styles.msgRowMe : ''}`}>
                      <div
                        className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem}`}
                        style={isMe ? { background: schoolColor } : undefined}
                      >
                        {msg.file_type === 'image' && msg.file_url ? (
                          <img src={msg.file_url} alt="img"
                            style={{ width: '100%', maxWidth: 180, borderRadius: 8, display: 'block' }}
                            onClick={() => window.open(msg.file_url!, '_blank')}
                          />
                        ) : msg.file_type === 'file' && msg.file_url ? (
                          <a href={msg.file_url} target="_blank" rel="noreferrer"
                            style={{ color: 'inherit', fontSize: '0.78rem' }}>
                            📎 {msg.content}
                          </a>
                        ) : msg.is_deleted ? (
                          <p style={{ fontStyle: 'italic', opacity: 0.6, margin: 0, fontSize: '0.78rem' }}>
                            🚫 Deleted
                          </p>
                        ) : (
                          <p style={{ margin: 0 }}>{msg.content}</p>
                        )}
                        <span className={styles.msgTime}>{formatTime(msg.sent_at)}</span>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Input row — NO mic button */}
              <div className={styles.inputRow}>
                <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={sendFile}
                  accept="image/*,.pdf,.doc,.docx,.txt" />
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex', alignItems: 'center' }}
                  onClick={() => fileRef.current?.click()}
                  title="Attach file"
                >
                  <PaperclipIcon size={16} color="var(--text-muted)" />
                </button>
                <input
                  ref={inputRef}
                  className={styles.input}
                  value={text}
                  onChange={e => setText(e.target.value)}
                  onKeyDown={handleKey}
                  placeholder="Message..."
                />
                <button
                  className={styles.sendBtn}
                  style={{ background: schoolColor, opacity: (!text.trim() || sending) ? 0.45 : 1 }}
                  onClick={sendText}
                  disabled={!text.trim() || sending}
                >
                  <SendIcon size={14} color="white" />
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
