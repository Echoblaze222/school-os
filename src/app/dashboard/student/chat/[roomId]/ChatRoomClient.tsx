'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SendIcon, MicIcon, StopIcon, PaperclipIcon,
  ArrowLeftIcon, SmileIcon, MoreIcon,
} from '@/components/Icons'
import { useVoiceRecorder, formatDuration } from '@/hooks/useVoiceRecorder'
import styles from './chat-room.module.css'

interface Message {
  id:         string
  body:       string
  sender_id:  string
  created_at: string
  type:       'text' | 'audio' | 'image' | 'file'
  audio_url?: string
  file_url?:  string
  file_name?: string
  reactions?: Record<string, string[]>
  sender?:    { full_name: string; avatar_url?: string }
}

interface Props {
  roomId:  string
  userId:  string
  role:    string
  school?: any
}

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉']

export default function ChatRoomClient({ roomId, userId, role, school }: Props) {
  const [messages,    setMessages]    = useState<Message[]>([])
  const [roomInfo,    setRoomInfo]    = useState<any>(null)
  const [text,        setText]        = useState('')
  const [sending,     setSending]     = useState(false)
  const [loading,     setLoading]     = useState(true)
  const [emojiTarget, setEmojiTarget] = useState<string | null>(null)
  const [online,      setOnline]      = useState<string[]>([])
  const router     = useRouter()
  const supabase   = createClient()
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const voice      = useVoiceRecorder(120)

  const schoolColor = school?.primary_color ?? '#7C3AED'

  // ── Load room + messages ─────────────────────────────────
  useEffect(() => {
    loadRoom()
    loadMessages()

    const ch = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `room_id=eq.${roomId}`,
      }, async payload => {
        const { data: msg } = await supabase
          .from('messages')
          .select('*, sender:profiles(full_name, avatar_url)')
          .eq('id', payload.new.id)
          .single()
        if (msg) setMessages(prev => [...prev, msg as Message])
      })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        setOnline(Object.keys(state))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: userId, online_at: new Date().toISOString() })
        }
      })

    return () => { supabase.removeChannel(ch) }
  }, [roomId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function loadRoom() {
    const { data } = await supabase
      .from('chat_rooms')
      .select('id, name, description, type')
      .eq('id', roomId)
      .single()
    if (data) setRoomInfo(data)
  }

  async function loadMessages() {
    setLoading(true)
    const { data } = await supabase
      .from('messages')
      .select('*, sender:profiles(full_name, avatar_url)')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(100)
    if (data) setMessages(data as Message[])
    setLoading(false)
  }

  // ── Send text ─────────────────────────────────────────────
  async function sendText() {
    if (!text.trim() || sending) return
    setSending(true)
    const body = text.trim()
    setText('')
    inputRef.current?.focus()
    await supabase.from('messages').insert({
      room_id: roomId, sender_id: userId,
      body, type: 'text',
    })
    setSending(false)
  }

  // ── Send voice ────────────────────────────────────────────
  async function sendVoice() {
    if (!voice.audioBlob || sending) return
    setSending(true)
    const fileName = `voice/${userId}/${Date.now()}.webm`
    const { error } = await supabase.storage
      .from('chat-audio')
      .upload(fileName, voice.audioBlob, { contentType: 'audio/webm' })
    if (!error) {
      const { data: url } = supabase.storage.from('chat-audio').getPublicUrl(fileName)
      await supabase.from('messages').insert({
        room_id: roomId, sender_id: userId,
        body: '🎤 Voice message', type: 'audio',
        audio_url: url.publicUrl,
      })
    }
    voice.resetRecording()
    setSending(false)
  }

  // ── Send file ─────────────────────────────────────────────
  async function sendFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || sending) return
    setSending(true)
    const ext      = file.name.split('.').pop()
    const fileName = `files/${userId}/${Date.now()}.${ext}`
    const isImage  = file.type.startsWith('image/')
    const bucket   = isImage ? 'chat-images' : 'chat-files'
    const { error } = await supabase.storage.from(bucket).upload(fileName, file)
    if (!error) {
      const { data: url } = supabase.storage.from(bucket).getPublicUrl(fileName)
      await supabase.from('messages').insert({
        room_id: roomId, sender_id: userId,
        body: isImage ? '🖼️ Image' : `📎 ${file.name}`,
        type: isImage ? 'image' : 'file',
        file_url: url.publicUrl,
        file_name: file.name,
      })
    }
    e.target.value = ''
    setSending(false)
  }

  // ── React to message ──────────────────────────────────────
  async function addReaction(msgId: string, emoji: string) {
    const msg = messages.find(m => m.id === msgId)
    if (!msg) return
    const reactions = { ...(msg.reactions ?? {}) }
    if (!reactions[emoji]) reactions[emoji] = []
    if (reactions[emoji].includes(userId)) {
      reactions[emoji] = reactions[emoji].filter(id => id !== userId)
      if (reactions[emoji].length === 0) delete reactions[emoji]
    } else {
      reactions[emoji] = [...reactions[emoji], userId]
    }
    await supabase.from('messages').update({ reactions }).eq('id', msgId)
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m))
    setEmojiTarget(null)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  function formatTime(d: string) {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(d: string) {
    const date = new Date(d)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  }

  // Group messages by date
  const grouped = messages.reduce((acc, msg) => {
    const day = new Date(msg.created_at).toDateString()
    if (!acc[day]) acc[day] = []
    acc[day].push(msg)
    return acc
  }, {} as Record<string, Message[]>)

  return (
    <div className={styles.page}>
      {/* ── HEADER ─────────────────────────────────────────── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeftIcon size={20} />
        </button>
        <div className={styles.roomInfo}>
          <div className={styles.roomAvatar} style={{ background: schoolColor }}>
            {roomInfo?.name?.[0] ?? '#'}
          </div>
          <div>
            <p className={styles.roomName}>{roomInfo?.name ?? 'Chat Room'}</p>
            <p className={styles.roomMeta}>
              {online.length > 0 ? `${online.length} online` : roomInfo?.description ?? ''}
            </p>
          </div>
        </div>
        <button className={styles.moreBtn}>
          <MoreIcon size={20} />
        </button>
      </header>

      {/* ── MESSAGES ───────────────────────────────────────── */}
      <div className={styles.messages}>
        {loading && (
          <div className={styles.loadingRow}>
            <div className={styles.dots}><span/><span/><span/></div>
          </div>
        )}

        {Object.entries(grouped).map(([day, msgs]) => (
          <div key={day}>
            {/* Date separator */}
            <div className={styles.dateSep}>
              <span>{formatDate(msgs[0].created_at)}</span>
            </div>

            {msgs.map((msg, i) => {
              const isMe        = msg.sender_id === userId
              const showAvatar  = !isMe && (i === 0 || msgs[i-1]?.sender_id !== msg.sender_id)
              const showName    = showAvatar

              return (
                <div key={msg.id} className={`${styles.msgGroup} ${isMe ? styles.msgGroupMe : ''}`}>
                  {/* Avatar */}
                  {!isMe && (
                    <div className={styles.avatarCol}>
                      {showAvatar && (
                        <div className={styles.senderAvatar} style={{ background: schoolColor }}>
                          {msg.sender?.full_name?.[0] ?? '?'}
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.bubbleCol}>
                    {showName && !isMe && (
                      <p className={styles.senderName}>{msg.sender?.full_name}</p>
                    )}

                    <div
                      className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem}`}
                      style={isMe ? { background: schoolColor } : undefined}
                      onDoubleClick={() => setEmojiTarget(emojiTarget === msg.id ? null : msg.id)}
                    >
                      {/* Content */}
                      {msg.type === 'audio' && msg.audio_url && (
                        <audio controls src={msg.audio_url} className={styles.audio} />
                      )}
                      {msg.type === 'image' && msg.file_url && (
                        <img src={msg.file_url} alt="Image" className={styles.msgImage} />
                      )}
                      {msg.type === 'file' && msg.file_url && (
                        <a href={msg.file_url} target="_blank" rel="noreferrer" className={styles.fileLink}>
                          📎 {msg.file_name}
                        </a>
                      )}
                      {(msg.type === 'text' || !msg.type) && (
                        <p className={styles.bubbleText}>{msg.body}</p>
                      )}
                      <span className={styles.msgTime}>{formatTime(msg.created_at)}</span>
                    </div>

                    {/* Reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={styles.reactions}>
                        {Object.entries(msg.reactions).map(([emoji, users]) => (
                          users.length > 0 && (
                            <button
                              key={emoji}
                              className={`${styles.reaction} ${users.includes(userId) ? styles.reactionMe : ''}`}
                              onClick={() => addReaction(msg.id, emoji)}
                            >
                              {emoji} {users.length}
                            </button>
                          )
                        ))}
                      </div>
                    )}

                    {/* Emoji picker */}
                    {emojiTarget === msg.id && (
                      <div className={styles.emojiPicker}>
                        {EMOJIS.map(e => (
                          <button key={e} className={styles.emojiBtn} onClick={() => addReaction(msg.id, e)}>
                            {e}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* ── VOICE RECORDING BAR ────────────────────────────── */}
      {voice.state === 'recording' && (
        <div className={styles.recordingBar}>
          <div className={styles.recDot} />
          <span className={styles.recTimer}>{formatDuration(voice.duration)}</span>
          <div className={styles.recWave}>
            {[...Array(12)].map((_, i) => (
              <div key={i} className={styles.recWaveBar}
                style={{ animationDelay: `${i * 80}ms` }} />
            ))}
          </div>
          <button className={styles.recCancelBtn} onClick={voice.cancelRecording}>Cancel</button>
          <button className={styles.recSendBtn} style={{ background: schoolColor }} onClick={voice.stopRecording}>
            <StopIcon size={16} color="white" />
          </button>
        </div>
      )}

      {/* ── VOICE PREVIEW BAR ──────────────────────────────── */}
      {voice.state === 'stopped' && voice.audioUrl && (
        <div className={styles.previewBar}>
          <audio controls src={voice.audioUrl} className={styles.previewAudio} />
          <button className={styles.discardBtn} onClick={voice.resetRecording}>✕</button>
          <button className={styles.sendVoiceBtn} style={{ background: schoolColor }} onClick={sendVoice} disabled={sending}>
            <SendIcon size={16} color="white" />
          </button>
        </div>
      )}

      {/* ── INPUT BAR ──────────────────────────────────────── */}
      {voice.state === 'idle' && (
        <div className={styles.inputBar}>
          {/* File attach */}
          <input ref={fileRef} type="file" className={styles.fileInput} onChange={sendFile} />
          <button className={styles.attachBtn} onClick={() => fileRef.current?.click()}>
            <PaperclipIcon size={18} color="var(--text-muted)" />
          </button>

          {/* Text input */}
          <input
            ref={inputRef}
            className={styles.textInput}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Message..."
          />

          {/* Send or Mic */}
          {text.trim()
            ? <button className={styles.sendBtn} style={{ background: schoolColor }} onClick={sendText} disabled={sending}>
                <SendIcon size={16} color="white" />
              </button>
            : <button className={styles.micBtn} onClick={voice.startRecording}>
                <MicIcon size={18} color={schoolColor} />
              </button>
          }
        </div>
      )}

      {/* Error */}
      {voice.error && <p className={styles.voiceError}>{voice.error}</p>}
    </div>
  )
}
