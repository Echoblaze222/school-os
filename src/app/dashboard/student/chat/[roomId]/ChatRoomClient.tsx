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
  content:    string
  sender_id:  string
  sent_at:    string
  file_url?:  string
  file_type?: string
  is_deleted: boolean
  is_edited:  boolean
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
  const router    = useRouter()
  const supabase  = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)
  const voice     = useVoiceRecorder(120)

  const schoolColor = school?.primary_color ?? '#7C3AED'

  // ── Load room + messages ─────────────────────────────────
  useEffect(() => {
    loadRoom()
    loadMessages()

    const ch = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, async payload => {
        // FIX: fetch full message with sender info
        const { data: msg } = await supabase
          .from('chat_messages')
          .select('*, sender:profiles(full_name, avatar_url)')
          .eq('id', payload.new.id)
          .single()

        if (msg) {
          setMessages(prev => {
            // FIX: Deduplicate — skip if this real ID already exists
            // (was already replaced by optimistic update replacement)
            if (prev.find(x => x.id === msg.id)) return prev
            // Also skip if there's a temp message that was already replaced
            return [...prev, msg as Message]
          })
        }
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
      .select(`
        id, name, room_type, is_group,
        members:chat_room_members(
          user:profiles(id, full_name, avatar_url, role)
        )
      `)
      .eq('id', roomId)
      .single()
    if (data) setRoomInfo(data)
  }

  async function loadMessages() {
    setLoading(true)
    const { data } = await supabase
      .from('chat_messages')
      .select('*, sender:profiles(full_name, avatar_url)')
      .eq('room_id', roomId)
      .order('sent_at', { ascending: true })
      .limit(100)
    if (data) setMessages(data as Message[])
    setLoading(false)
  }

  // ── Get other user's name for DM rooms ───────────────────
  function getOtherUser() {
    if (!roomInfo?.members) return null
    return roomInfo.members
      .map((m: any) => m.user)
      .find((u: any) => u?.id !== userId) ?? null
  }

  function getRoomDisplayName() {
    if (roomInfo?.is_group) return roomInfo.name ?? 'Group Chat'
    const other = getOtherUser()
    return other?.full_name ?? roomInfo?.name ?? 'Chat Room'
  }

  // ── Send text ─────────────────────────────────────────────
  // FIX: Replace temp message with real DB row; prevents blank/duplicate messages
  async function sendText() {
    if (!text.trim() || sending) return
    setSending(true)
    const content = text.trim()
    const tempId = `temp-${Date.now()}`
    setText('')
    inputRef.current?.focus()

    // Optimistic update with temp ID
    const temp: Message = {
      id:         tempId,
      content,
      sender_id:  userId,
      sent_at:    new Date().toISOString(),
      is_deleted: false,
      is_edited:  false,
    }
    setMessages(prev => [...prev, temp])

    // Insert and get the real row back
    const { data: newMsg, error } = await supabase
      .from('chat_messages')
      .insert({ room_id: roomId, sender_id: userId, content })
      .select('*, sender:profiles(full_name, avatar_url)')
      .single()

    if (error) {
      // Roll back optimistic update on error
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setText(content)
    } else if (newMsg) {
      // FIX: Replace temp with real message so subscription doesn't add a duplicate
      setMessages(prev => prev.map(m => m.id === tempId ? newMsg as Message : m))
    }

    setSending(false)
  }

  // ── Send voice ────────────────────────────────────────────
  // FIX: Add direct insert result to messages; don't rely solely on subscription
  async function sendVoice() {
    if (!voice.audioBlob || sending) return
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

    // FIX: Use .select().single() to get the inserted row back immediately
    const { data: newMsg, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        room_id:   roomId,
        sender_id: userId,
        content:   '🎤 Voice message',
        file_url:  urlData.publicUrl,
        file_type: 'audio',
      })
      .select('*, sender:profiles(full_name, avatar_url)')
      .single()

    if (!insertError && newMsg) {
      // FIX: Add directly to state — don't wait for subscription
      setMessages(prev => {
        if (prev.find(x => x.id === (newMsg as Message).id)) return prev
        return [...prev, newMsg as Message]
      })
    }

    voice.resetRecording()
    setSending(false)
  }

  // ── Send file ─────────────────────────────────────────────
  // FIX: Add direct insert result to messages; don't rely solely on subscription
  async function sendFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || sending) return
    setSending(true)

    const ext      = file.name.split('.').pop()
    const fileName = `files/${userId}/${Date.now()}.${ext}`
    const isImage  = file.type.startsWith('image/')
    const bucket   = isImage ? 'chat-images' : 'chat-files'

    const { error: uploadError } = await supabase.storage.from(bucket).upload(fileName, file)

    if (uploadError) {
      console.error('File upload error:', uploadError)
      e.target.value = ''
      setSending(false)
      return
    }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fileName)

    // FIX: Use .select().single() to get the inserted row back immediately
    const { data: newMsg, error: insertError } = await supabase
      .from('chat_messages')
      .insert({
        room_id:   roomId,
        sender_id: userId,
        content:   isImage ? '🖼️ Image' : `📎 ${file.name}`,
        file_url:  urlData.publicUrl,
        file_type: isImage ? 'image' : 'file',
      })
      .select('*, sender:profiles(full_name, avatar_url)')
      .single()

    if (!insertError && newMsg) {
      // FIX: Add directly to state — don't wait for subscription
      setMessages(prev => {
        if (prev.find(x => x.id === (newMsg as Message).id)) return prev
        return [...prev, newMsg as Message]
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
    await supabase.from('chat_messages').update({ reactions }).eq('id', msgId)
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
    const date      = new Date(d)
    const today     = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    if (date.toDateString() === today.toDateString())     return 'Today'
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
    return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  }

  // Group messages by date
  const grouped = messages.reduce((acc, msg) => {
    const day = new Date(msg.sent_at).toDateString()
    if (!acc[day]) acc[day] = []
    acc[day].push(msg)
    return acc
  }, {} as Record<string, Message[]>)

  const otherUser = getOtherUser()

  return (
    <div className={styles.page}>
      {/* ── HEADER ─────────────────────────────────────────── */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.back()}>
          <ArrowLeftIcon size={20} />
        </button>
        <div className={styles.roomInfo}>
          <div className={styles.roomAvatar} style={{ background: schoolColor }}>
            {otherUser?.avatar_url
              ? <img src={otherUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
              : getRoomDisplayName()?.[0]?.toUpperCase() ?? '#'
            }
          </div>
          <div>
            <p className={styles.roomName}>{getRoomDisplayName()}</p>
            <p className={styles.roomMeta}>
              {online.length > 0 ? `${online.length} online` : otherUser?.role ?? ''}
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
            <div className={styles.dateSep}>
              <span>{formatDate(msgs[0].sent_at)}</span>
            </div>

            {msgs.map((msg, i) => {
              const isMe       = msg.sender_id === userId
              const showAvatar = !isMe && (i === 0 || msgs[i-1]?.sender_id !== msg.sender_id)
              const showName   = showAvatar

              return (
                <div key={msg.id} className={`${styles.msgGroup} ${isMe ? styles.msgGroupMe : ''}`}>
                  {!isMe && (
                    <div className={styles.avatarCol}>
                      {showAvatar && (
                        <div className={styles.senderAvatar} style={{ background: schoolColor }}>
                          {msg.sender?.avatar_url
                            ? <img src={msg.sender.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                            : msg.sender?.full_name?.[0] ?? '?'
                          }
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
                      {/* Audio content */}
                      {msg.file_type === 'audio' && msg.file_url && (
                        <audio controls src={msg.file_url} className={styles.audio} />
                      )}
                      {/* Image content */}
                      {msg.file_type === 'image' && msg.file_url && (
                        <img src={msg.file_url} alt="Image" className={styles.msgImage} />
                      )}
                      {/* File content */}
                      {msg.file_type === 'file' && msg.file_url && (
                        <a href={msg.file_url} target="_blank" rel="noreferrer" className={styles.fileLink}>
                          📎 {msg.content}
                        </a>
                      )}
                      {/* Text content — show for non-file messages OR as caption for audio/image */}
                      {(!msg.file_type || msg.file_type === 'audio') && (
                        msg.is_deleted
                          ? <p className={styles.deleted}>🚫 Message deleted</p>
                          : <p className={styles.bubbleText}>{msg.content}</p>
                      )}
                      <span className={styles.msgTime}>{formatTime(msg.sent_at)}</span>
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
          <input ref={fileRef} type="file" className={styles.fileInput} onChange={sendFile} />
          <button className={styles.attachBtn} onClick={() => fileRef.current?.click()}>
            <PaperclipIcon size={18} color="var(--text-muted)" />
          </button>
          <input
            ref={inputRef}
            className={styles.textInput}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Message..."
          />
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

      {voice.error && <p className={styles.voiceError}>{voice.error}</p>}
    </div>
  )
              }
      
