'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { MessageIcon, SendIcon, PaperclipIcon, MicIcon, StopIcon, XIcon } from './Icons'
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder'
import styles from './ChatWidget.module.css'

interface Message {
  id:         string
  body:       string
  sender_id:  string
  created_at: string
  type:       'text' | 'audio'
  audio_url?: string
}

interface Room {
  id:    string
  name:  string
  avatar?: string
}

interface Props {
  userId:      string
  role:        string
  schoolColor?: string
}

export default function ChatWidget({ userId, role, schoolColor = '#7C3AED' }: Props) {
  const [open,     setOpen]     = useState(false)
  const [rooms,    setRooms]    = useState<Room[]>([])
  const [activeRoom, setActiveRoom] = useState<Room | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [text,     setText]     = useState('')
  const [sending,  setSending]  = useState(false)
  const [unread,   setUnread]   = useState(0)
  const supabase = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const voice = useVoiceRecorder(60)

  // Load rooms on mount
  useEffect(() => {
    loadRooms()
  }, [userId])

  // Subscribe to new messages
  useEffect(() => {
    if (!activeRoom) return
    loadMessages(activeRoom.id)

    const ch = supabase.channel(`chat:${activeRoom.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `room_id=eq.${activeRoom.id}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new as Message])
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [activeRoom])

  // Scroll to bottom on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  async function loadMessages(roomId: string) {
    const { data } = await supabase
      .from('messages')
      .select('id, body, sender_id, created_at, type, audio_url')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(50)
    if (data) setMessages(data as Message[])
  }

  async function sendText() {
    if (!text.trim() || !activeRoom || sending) return
    setSending(true)
    const body = text.trim()
    setText('')
    await supabase.from('messages').insert({
      room_id:   activeRoom.id,
      sender_id: userId,
      body,
      type:      'text',
    })
    setSending(false)
  }

  async function sendVoice() {
    if (!voice.audioBlob || !activeRoom) return
    setSending(true)
    // Upload audio to Supabase Storage
    const fileName = `voice/${userId}/${Date.now()}.webm`
    const { data: upload } = await supabase.storage
      .from('chat-audio')
      .upload(fileName, voice.audioBlob, { contentType: 'audio/webm' })

    if (upload) {
      const { data: url } = supabase.storage
        .from('chat-audio')
        .getPublicUrl(fileName)

      await supabase.from('messages').insert({
        room_id:   activeRoom.id,
        sender_id: userId,
        body:      '🎤 Voice message',
        type:      'audio',
        audio_url: url.publicUrl,
      })
    }
    voice.resetRecording()
    setSending(false)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendText()
    }
  }

  function formatTime(d: string) {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

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
          ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <MessageIcon size={20} color="white" />
        }
        {unread > 0 && <span className={styles.fabBadge}>{unread}</span>}
      </button>

      {/* Widget panel */}
      {open && (
        <div className={styles.panel}>
          {/* Header */}
          <div className={styles.header} style={{ background: schoolColor }}>
            {activeRoom
              ? <>
                  <button className={styles.backBtn} onClick={() => setActiveRoom(null)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  </button>
                  <div>
                    <p className={styles.headerTitle}>{activeRoom.name}</p>
                    <p className={styles.headerSub}>Active now</p>
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
              {rooms.length === 0
                ? <div className={styles.emptyRooms}>
                    <MessageIcon size={28} color="var(--text-faint)" />
                    <p>No chats yet</p>
                  </div>
                : rooms.map(room => (
                    <button
                      key={room.id}
                      className={styles.roomItem}
                      onClick={() => setActiveRoom(room)}
                    >
                      <div className={styles.roomAvatar} style={{ background: schoolColor }}>
                        {room.name[0]}
                      </div>
                      <span className={styles.roomName}>{room.name}</span>
                    </button>
                  ))
              }
              <a href={`/dashboard/${role}/chat`} className={styles.viewAllChats}>
                Open full chat →
              </a>
            </div>
          )}

          {/* Messages */}
          {activeRoom && (
            <>
              <div className={styles.messages}>
                {messages.map(msg => {
                  const isMe = msg.sender_id === userId
                  return (
                    <div key={msg.id} className={`${styles.msgRow} ${isMe ? styles.msgRowMe : ''}`}>
                      <div className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem}`}
                        style={isMe ? { background: schoolColor } : undefined}
                      >
                        {msg.type === 'audio' && msg.audio_url
                          ? <audio controls src={msg.audio_url} className={styles.audioPlayer} />
                          : <p>{msg.body}</p>
                        }
                        <span className={styles.msgTime}>{formatTime(msg.created_at)}</span>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottomRef} />
              </div>

              {/* Voice recorder UI */}
              {voice.state === 'recording' && (
                <div className={styles.recordingBar}>
                  <div className={styles.recDot} />
                  <span>Recording {formatDuration(voice.duration)}</span>
                  <button className={styles.recCancel} onClick={voice.cancelRecording}>Cancel</button>
                  <button className={styles.recStop} onClick={voice.stopRecording}>
                    <StopIcon size={14} color="white" />
                  </button>
                </div>
              )}

              {voice.state === 'stopped' && voice.audioUrl && (
                <div className={styles.previewBar}>
                  <audio controls src={voice.audioUrl} className={styles.audioPreview} />
                  <button className={styles.sendVoiceBtn} style={{ background: schoolColor }} onClick={sendVoice}>
                    <SendIcon size={14} color="white" />
                  </button>
                  <button className={styles.discardBtn} onClick={voice.resetRecording}>✕</button>
                </div>
              )}

              {/* Input */}
              {voice.state === 'idle' && (
                <div className={styles.inputRow}>
                  <input
                    className={styles.input}
                    value={text}
                    onChange={e => setText(e.target.value)}
                    onKeyDown={handleKey}
                    placeholder="Message..."
                  />
                  <button
                    className={styles.micBtn}
                    onClick={voice.startRecording}
                    title="Voice message"
                  >
                    <MicIcon size={16} color="var(--text-muted)" />
                  </button>
                  <button
                    className={styles.sendBtn}
                    style={{ background: schoolColor }}
                    onClick={sendText}
                    disabled={!text.trim() || sending}
                  >
                    <SendIcon size={14} color="white" />
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
