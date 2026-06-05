'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  MessageIcon, SendIcon, PaperclipIcon, MicIcon, StopIcon, XIcon,
} from './Icons'
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder'
import styles from './ChatWidget.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Message {
  id:         string
  content:    string          // correct field name: content (not body)
  sender_id:  string
  sent_at:    string          // correct field name: sent_at (not created_at)
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatWidget({ userId, role, schoolColor = '#7C3AED' }: Props) {
  const [open,       setOpen]       = useState(false)
  const [rooms,      setRooms]      = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [messages,   setMessages]   = useState<Message[]>([])
  const [text,       setText]       = useState('')
  const [sending,    setSending]    = useState(false)
  const [unread,     setUnread]     = useState(0)

  const supabase  = createClient()
  const router    = useRouter()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const voice     = useVoiceRecorder(60)

  // Load rooms on mount
  useEffect(() => {
    loadRooms()
  }, [userId])

  // Subscribe to new messages in active room
  useEffect(() => {
    if (!activeRoom) return
    loadMessages(activeRoom.id)

    const ch = supabase
      .channel(`widget:${activeRoom.id}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'chat_messages',                      // FIX: was 'messages'
        filter: `room_id=eq.${activeRoom.id}`,
      }, async payload => {
        const { data: msg } = await supabase
          .from('chat_messages')
          .select('id, content, sender_id, sent_at, file_type, file_url, is_deleted')
          .eq('id', payload.new.id)
          .single()

        if (msg) {
          setMessages(prev => {
            if (prev.find(x => x.id === msg.id)) return prev
            return [...prev, msg as Message]
          })
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [activeRoom])

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Track unread across all rooms
  useEffect(() => {
    if (open || !userId) return
    const ch = supabase
      .channel(`widget-unread:${userId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'chat_messages',
      }, payload => {
        const msg = payload.new as any
        if (msg.sender_id !== userId) {
          setUnread(prev => prev + 1)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [open, userId])

  // Reset unread when opened
  useEffect(() => {
    if (open) setUnread(0)
  }, [open])

  // ── Load rooms ────────────────────────────────────────────────────────────────

  async function loadRooms() {
    const { data } = await supabase
      .from('chat_room_members')
      .select('room:chat_rooms(id, name)')
      .eq('user_id', userId)
      .limit(10)

    if (data) {
      const r = data.map((d: any) => d.room).filter(Boolean)
      setRooms(r)
    }
  }

  // ── Load messages ─────────────────────────────────────────────────────────────

  async function loadMessages(roomId: string) {
    const { data } = await supabase
      .from('chat_messages')                          // FIX: was 'messages'
      .select('id, content, sender_id, sent_at, file_type, file_url, is_deleted')
      .eq('room_id', roomId)
      .order('sent_at', { ascending: true })          // FIX: was 'created_at'
      .limit(50)

    if (data) setMessages(data as Message[])
  }

  // ── Send text ─────────────────────────────────────────────────────────────────

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

  // ── Send voice ────────────────────────────────────────────────────────────────

  async function sendVoice() {
    if (!voice.audioBlob || !activeRoom || sending) return
    setSending(true)

    const fileName = `voice/${userId}/${Date.now()}.webm`
    const { error: uploadError } = await supabase.storage
      .from('chat-audio')
      .upload(fileName, voice.audioBlob, { contentType: 'audio/webm' })

    if (uploadError) {
      console.error('Voice upload error:', uploadError)
      setSending(false)
      return
    }

    const { data: urlData } = supabase.storage.from('chat-audio').getPublicUrl(fileName)

    const { data: newMsg } = await supabase
      .from('chat_messages')
      .insert({
        room_id:   activeRoom.id,
        sender_id: userId,
        content:   '🎤 Voice message',
        file_url:  urlData.publicUrl,
        file_type: 'audio',
      })
      .select('id, content, sender_id, sent_at, file_type, file_url, is_deleted')
      .single()

    if (newMsg) {
      setMessages(prev => {
        if (prev.find(x => x.id === (newMsg as Message).id)) return prev
        return [...prev, newMsg as Message]
      })
    }

    voice.resetRecording()
    setSending(false)
  }

  // ── Send file ─────────────────────────────────────────────────────────────────

  async function sendFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !activeRoom || sending) return
    setSending(true)

    const ext      = file.name.split('.').pop()
    const isImage  = file.type.startsWith('image/')
    const bucket   = isImage ? 'chat-images' : 'chat-files'
    const fileName = `files/${userId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file)
    if (uploadError) { e.target.value = ''; setSending(false); return }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName)

    const { data: newMsg } = await supabase
      .from('chat_messages')
      .insert({
        room_id:   activeRoom.id,
        sender_id: userId,
        content:   isImage ? '🖼️ Image' : `📎 ${file.name}`,
        file_url:  urlData.publicUrl,
        file_type: isImage ? 'image' : 'file',
      })
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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.container}>

      {/* Floating button */}
      <button
        className={styles.fab}
        style={{ background: schoolColor }}
        onClick={() => setOpen(!open)}
        aria-label="Open chat"
      >
        {open
          ? <XIcon size={18} color="white" />
          : <MessageIcon size={20} color="white" />
        }
        {unread > 0 && (
          <span className={styles.fabBadge}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {/* Widget panel */}
      {open && (
        <div className={styles.panel}>

          {/* Header */}
          <div className={styles.header} style={{ background: schoolColor }}>
            {activeRoom
              ? <>
                  <button className={styles.backBtn} onClick={() => { setActiveRoom(null); setMessages([]) }}>
                    ←
                  </button>
                  <div>
                    <p className={styles.headerTitle}>{activeRoom.name}</p>
                    <p className={styles.headerSub}>Active</p>
                  </div>
                </>
              : <>
                  <MessageIcon size={16} color="white" />
                  <p className={styles.headerTitle}>Messages</p>
                </>
            }
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
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginLeft: 'auto' }}>→</span>
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
                  <div className={styles.emptyMessages}>
                    <p>Say hello! 👋</p>
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
                        {msg.file_type === 'audio' && msg.file_url ? (
                          <audio controls src={msg.file_url} className={styles.audioPlayer} />
                        ) : msg.file_type === 'image' && msg.file_url ? (
                          <img src={msg.file_url} alt="img" className={styles.msgImage} />
                        ) : msg.is_deleted ? (
                          <p className={styles.deleted}>🚫 Deleted</p>
                        ) : (
                          <p>{msg.content}</p>
                        )}
                        <span className={styles.msgTime}>{formatTime(msg.sent_at)}</span>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Recording UI */}
              {voice.state === 'recording' && (
                <div className={styles.recordingBar}>
                  <div className={styles.recDot} />
                  <span>{formatDuration(voice.duration)}</span>
                  <button className={styles.recCancel} onClick={voice.cancelRecording}>Cancel</button>
                  <button className={styles.recStop} style={{ background: schoolColor }} onClick={voice.stopRecording}>
                    <StopIcon size={13} color="white" />
                  </button>
                </div>
              )}

              {voice.state === 'stopped' && voice.audioUrl && (
                <div className={styles.previewBar}>
                  <audio controls src={voice.audioUrl} className={styles.audioPreview} />
                  <button className={styles.sendVoiceBtn} style={{ background: schoolColor }} onClick={sendVoice} disabled={sending}>
                    <SendIcon size={13} color="white" />
                  </button>
                  <button className={styles.discardBtn} onClick={voice.resetRecording}>✕</button>
                </div>
              )}

              {/* Input bar */}
              {voice.state === 'idle' && (
                <div className={styles.inputRow}>
                  <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={sendFile} accept="image/*,.pdf,.doc,.docx" />
                  <button className={styles.attachBtn} onClick={() => fileRef.current?.click()} title="Attach">
                    <PaperclipIcon size={15} color="var(--text-muted)" />
                  </button>
                  <input
                    ref={inputRef}
                    className={styles.input}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Message..."
                  />
                  {text.trim() ? (
                    <button
                      className={styles.sendBtn}
                      style={{ background: schoolColor }}
                      onClick={sendText}
                      disabled={!text.trim() || sending}
                    >
                      <SendIcon size={13} color="white" />
                    </button>
                  ) : (
                    <button
                      className={styles.micBtn}
                      onClick={voice.startRecording}
                      title="Voice message"
                    >
                      <MicIcon size={15} color={schoolColor} />
                    </button>
                  )}
                </div>
              )}

              {voice.error && (
                <p style={{ fontSize: '0.7rem', color: 'var(--danger)', textAlign: 'center', padding: '4px 8px' }}>
                  {voice.error}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
