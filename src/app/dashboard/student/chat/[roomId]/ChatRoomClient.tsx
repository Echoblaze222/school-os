'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SendIcon, PaperclipIcon,
  ArrowLeftIcon, SmileIcon, MoreIcon, XIcon,
} from '@/components/Icons'
import styles from './chat-room.module.css'

interface Message {
  id:         string
  content:    string
  sender_id:  string
  sent_at:    string
  file_url?:  string | null
  file_type?: string | null
  is_deleted: boolean
  is_edited:  boolean
  reactions?: Record<string, string[]>
  reply_to_id?: string | null
  reply_to?:  { content: string; sender_name: string } | null
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
  const [replyTo,     setReplyTo]     = useState<Message | null>(null)
  const [showMenu,    setShowMenu]    = useState(false)

  const router    = useRouter()
  const supabase  = createClient()
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const fileRef   = useRef<HTMLInputElement>(null)

  const schoolColor = school?.primary_color ?? '#7C3AED'

  // ── Load room + messages + realtime ──────────────────────
  useEffect(() => {
    loadRoom()
    loadMessages()

    const ch = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, async payload => {
        const { data: msg } = await supabase
          .from('chat_messages')
          .select('*, sender:profiles(full_name, avatar_url)')
          .eq('id', payload.new.id)
          .single()

        if (msg) {
          setMessages(prev => {
            if (prev.find(x => x.id === (msg as Message).id)) return prev
            return [...prev, msg as Message]
          })
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'chat_messages',
        filter: `room_id=eq.${roomId}`,
      }, payload => {
        setMessages(prev => prev.map(m =>
          m.id === payload.new.id ? { ...m, ...(payload.new as Message) } : m
        ))
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

  // Close emoji picker on outside click
  useEffect(() => {
    const handler = () => { setEmojiTarget(null); setShowMenu(false) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // ── Data loading ─────────────────────────────────────────
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

    if (data) {
      const msgs = data as Message[]
      // Enrich with reply context
      const enriched = msgs.map(m => {
        if (!m.reply_to_id) return m
        const parent = msgs.find(p => p.id === m.reply_to_id)
        if (!parent) return m
        return {
          ...m,
          reply_to: {
            content:     parent.is_deleted ? '🚫 Deleted' : parent.content,
            sender_name: parent.sender?.full_name ?? 'Unknown',
          },
        }
      })
      setMessages(enriched)
    }
    setLoading(false)
  }

  // ── Helpers ──────────────────────────────────────────────
  function getOtherUser() {
    if (!roomInfo?.members) return null
    return roomInfo.members.map((m: any) => m.user).find((u: any) => u?.id !== userId) ?? null
  }

  function getRoomDisplayName() {
    if (roomInfo?.is_group) return roomInfo.name ?? 'Group Chat'
    return getOtherUser()?.full_name ?? roomInfo?.name ?? 'Chat'
  }

  // ── Send notification to other user ──────────────────────
  async function pushNotification(content: string) {
    const otherUser = getOtherUser()
    if (!otherUser?.id) return
    // Fire and forget — insert directly, no API route needed
    await supabase.from('notifications').insert({
      user_id:    otherUser.id,
      title:      `New message from ${roomInfo?.members?.find((m: any) => m.user?.id === userId)?.user?.full_name ?? 'Someone'}`,
      body:       content.length > 100 ? content.slice(0, 100) + '…' : content,
      type:       'chat',
      action_url: `/dashboard/${otherUser.role}/chat/${roomId}`,
    })
  }

  // ── Send text ─────────────────────────────────────────────
  async function sendText() {
    if (!text.trim() || sending) return
    setSending(true)
    const content = text.trim()
    const replyId = replyTo?.id ?? null
    const tempId  = `temp-${Date.now()}`

    setText('')
    setReplyTo(null)
    inputRef.current?.focus()

    // Optimistic update
    const temp: Message = {
      id:          tempId,
      content,
      sender_id:   userId,
      sent_at:     new Date().toISOString(),
      is_deleted:  false,
      is_edited:   false,
      reply_to_id: replyId,
      reply_to:    replyTo ? {
        content:     replyTo.is_deleted ? '🚫 Deleted' : replyTo.content,
        sender_name: replyTo.sender?.full_name ?? 'Unknown',
      } : null,
    }
    setMessages(prev => [...prev, temp])

    const insertData: any = { room_id: roomId, sender_id: userId, content }
    if (replyId) insertData.reply_to_id = replyId

    const { data: newMsg, error } = await supabase
      .from('chat_messages')
      .insert(insertData)
      .select('*, sender:profiles(full_name, avatar_url)')
      .single()

    if (error) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setText(content)
    } else if (newMsg) {
      setMessages(prev => prev.map(m => m.id === tempId ? newMsg as Message : m))
      // Notify the other user
      pushNotification(content)
    }

    setSending(false)
  }

  // ── Send file / image ─────────────────────────────────────
  async function sendFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || sending) return
    setSending(true)

    const ext     = file.name.split('.').pop()
    const isImage = file.type.startsWith('image/')
    const bucket  = isImage ? 'chat-images' : 'chat-files'
    const fname   = `files/${userId}/${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage.from(bucket).upload(fname, file)
    if (uploadError) { e.target.value = ''; setSending(false); return }

    const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(fname)
    const content = isImage ? '🖼️ Image' : `📎 ${file.name}`

    const { data: newMsg, error: insertError } = await supabase
      .from('chat_messages')
      .insert({ room_id: roomId, sender_id: userId, content, file_url: urlData.publicUrl, file_type: isImage ? 'image' : 'file' })
      .select('*, sender:profiles(full_name, avatar_url)')
      .single()

    if (!insertError && newMsg) {
      setMessages(prev => {
        if (prev.find(x => x.id === (newMsg as Message).id)) return prev
        return [...prev, newMsg as Message]
      })
      pushNotification(content)
    }

    e.target.value = ''
    setSending(false)
  }

  // ── Reactions ─────────────────────────────────────────────
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

  // ── Delete ────────────────────────────────────────────────
  async function deleteMessage(msgId: string) {
    await supabase
      .from('chat_messages')
      .update({ is_deleted: true, content: '🚫 This message was deleted' })
      .eq('id', msgId)
      .eq('sender_id', userId)
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, is_deleted: true, content: '🚫 This message was deleted' } : m
    ))
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

  const grouped = messages.reduce((acc, msg) => {
    const day = new Date(msg.sent_at).toDateString()
    if (!acc[day]) acc[day] = []
    acc[day].push(msg)
    return acc
  }, {} as Record<string, Message[]>)

  const otherUser = getOtherUser()
  const isOnline  = online.length > 1

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
              ? <img src={otherUser.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
              : <span style={{ color:'#fff', fontWeight:700, fontSize:'1rem' }}>
                  {getRoomDisplayName()?.[0]?.toUpperCase() ?? '#'}
                </span>
            }
          </div>
          <div style={{ minWidth:0, flex:1 }}>
            <p className={styles.roomName}>{getRoomDisplayName()}</p>
            <p className={styles.roomMeta} style={{ color: isOnline ? '#22c55e' : undefined }}>
              {isOnline ? '● Online' : (otherUser?.role ?? '')}
            </p>
          </div>
        </div>
        <button
          className={styles.moreBtn}
          onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}
        >
          <MoreIcon size={20} />
        </button>
        {showMenu && (
          <div className={styles.headerMenu} onClick={e => e.stopPropagation()}>
            <button onClick={() => { loadMessages(); setShowMenu(false) }}>🔄 Refresh</button>
            <button onClick={() => router.push(`/dashboard/${role}/chat`)}>📋 All chats</button>
          </div>
        )}
      </header>

      {/* ── MESSAGES ───────────────────────────────────────── */}
      <div className={styles.messages}>
        {loading && (
          <div className={styles.loadingRow}>
            <div className={styles.dots}><span/><span/><span/></div>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className={styles.emptyMessages}>
            <p>No messages yet. Say hello! 👋</p>
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

              return (
                <div key={msg.id} className={`${styles.msgGroup} ${isMe ? styles.msgGroupMe : ''}`}>

                  {/* Avatar */}
                  {!isMe && (
                    <div className={styles.avatarCol}>
                      {showAvatar && (
                        <div className={styles.senderAvatar} style={{ background: schoolColor }}>
                          {msg.sender?.avatar_url
                            ? <img src={msg.sender.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                            : msg.sender?.full_name?.[0] ?? '?'
                          }
                        </div>
                      )}
                    </div>
                  )}

                  <div className={styles.bubbleCol}>
                    {showAvatar && !isMe && roomInfo?.is_group && (
                      <p className={styles.senderName}>{msg.sender?.full_name}</p>
                    )}

                    {/* Reply preview */}
                    {msg.reply_to && (
                      <div className={`${styles.replyPreview} ${isMe ? styles.replyPreviewMe : ''}`}>
                        <div className={styles.replyBar} style={{ background: isMe ? 'rgba(255,255,255,0.5)' : schoolColor }} />
                        <div className={styles.replyContent}>
                          <p className={styles.replyAuthor}>{msg.reply_to.sender_name}</p>
                          <p className={styles.replyText}>{msg.reply_to.content}</p>
                        </div>
                      </div>
                    )}

                    <div
                      className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem}`}
                      style={isMe ? { background: schoolColor } : undefined}
                      onDoubleClick={e => { e.stopPropagation(); setEmojiTarget(emojiTarget === msg.id ? null : msg.id) }}
                    >
                      {msg.file_type === 'image' && msg.file_url && (
                        <img src={msg.file_url} alt="Image" className={styles.msgImage}
                          onClick={() => window.open(msg.file_url!, '_blank')} />
                      )}
                      {msg.file_type === 'file' && msg.file_url && (
                        <a href={msg.file_url} target="_blank" rel="noreferrer" className={styles.fileLink}>
                          📎 {msg.content}
                        </a>
                      )}
                      {!msg.file_type && (
                        msg.is_deleted
                          ? <p className={styles.deleted}>🚫 Message deleted</p>
                          : <p className={styles.bubbleText}>{msg.content}</p>
                      )}
                      <div className={styles.msgFooter}>
                        {msg.is_edited && !msg.is_deleted && <span className={styles.edited}>edited</span>}
                        <span className={styles.msgTime}>{formatTime(msg.sent_at)}</span>
                        {isMe && <span className={styles.msgCheck}>✓✓</span>}
                      </div>
                    </div>

                    {/* Reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={styles.reactions}>
                        {Object.entries(msg.reactions).map(([emoji, users]) =>
                          users.length > 0 ? (
                            <button
                              key={emoji}
                              className={`${styles.reaction} ${users.includes(userId) ? styles.reactionMe : ''}`}
                              style={users.includes(userId) ? { borderColor: schoolColor } : undefined}
                              onClick={() => addReaction(msg.id, emoji)}
                            >
                              {emoji} {users.length}
                            </button>
                          ) : null
                        )}
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className={`${styles.msgActions} ${isMe ? styles.msgActionsMe : ''}`}>
                      <button className={styles.actionBtn} title="Reply"
                        onClick={e => { e.stopPropagation(); setReplyTo(msg); setTimeout(() => inputRef.current?.focus(), 50) }}>
                        ↩
                      </button>
                      <button className={styles.actionBtn} title="React"
                        onClick={e => { e.stopPropagation(); setEmojiTarget(emojiTarget === msg.id ? null : msg.id) }}>
                        <SmileIcon size={13} />
                      </button>
                      {isMe && !msg.is_deleted && (
                        <button className={styles.actionBtn} title="Delete"
                          onClick={e => { e.stopPropagation(); deleteMessage(msg.id) }}>
                          🗑
                        </button>
                      )}
                    </div>

                    {/* Emoji picker */}
                    {emojiTarget === msg.id && (
                      <div
                        className={`${styles.emojiPicker} ${isMe ? styles.emojiPickerMe : ''}`}
                        onClick={e => e.stopPropagation()}
                      >
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

      {/* ── REPLY BANNER ───────────────────────────────────── */}
      {replyTo && (
        <div className={styles.replyBanner}>
          <div className={styles.replyBannerBar} style={{ background: schoolColor }} />
          <div className={styles.replyBannerContent}>
            <p className={styles.replyBannerAuthor} style={{ color: schoolColor }}>
              Replying to {replyTo.sender?.full_name ?? 'message'}
            </p>
            <p className={styles.replyBannerText}>
              {replyTo.is_deleted ? '🚫 Deleted message' : replyTo.content}
            </p>
          </div>
          <button className={styles.replyBannerClose} onClick={() => setReplyTo(null)}>
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* ── INPUT BAR ──────────────────────────────────────── */}
      <div className={styles.inputBar}>
        <input ref={fileRef} type="file" className={styles.fileInput} onChange={sendFile}
          accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />
        <button className={styles.attachBtn} onClick={() => fileRef.current?.click()} title="Attach file">
          <PaperclipIcon size={18} color="var(--text-muted)" />
        </button>
        <input
          ref={inputRef}
          className={styles.textInput}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={handleKey}
          placeholder={replyTo ? `Replying to ${replyTo.sender?.full_name ?? 'message'}...` : 'Message...'}
        />
        <button
          className={styles.sendBtn}
          style={{ background: schoolColor, opacity: (!text.trim() || sending) ? 0.5 : 1 }}
          onClick={sendText}
          disabled={!text.trim() || sending}
        >
          <SendIcon size={16} color="white" />
        </button>
      </div>
    </div>
  )
}
