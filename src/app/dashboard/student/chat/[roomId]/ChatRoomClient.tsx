'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SendIcon, PaperclipIcon,
  ArrowLeftIcon, SmileIcon, MoreIcon, XIcon,
} from '@/components/Icons'
import styles from './chat-room.module.css'

interface Message {
  id:           string
  content:      string
  sender_id:    string
  sent_at:      string
  file_url?:    string | null
  file_type?:   string | null
  is_deleted:   boolean
  is_edited:    boolean
  reactions?:   Record<string, string[]>
  reply_to_id?: string | null
  reply_to?:    { content: string; sender_name: string } | null
  sender?:      { full_name: string; avatar_url?: string }
  // client-only fields — never sent to the server
  _status?:     'sending' | 'uploading' | 'sent' | 'failed'
  _progress?:   number
}

interface Props {
  roomId:  string
  userId:  string
  role:    string
  school?: any
}

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉']
const SWIPE_TRIGGER = 46   // px of drag before "release to reply" fires
const SWIPE_MAX     = 68   // px cap on how far the bubble can travel

// ── Background send queue ─────────────────────────────────────────────────
// Text + file sends are pushed here and processed one at a time in the
// background so the UI never blocks and multiple sends never race.
type QueueJob =
  | { kind: 'text'; tempId: string; content: string; replyId: string | null }
  | { kind: 'file'; tempId: string; file: File; caption: string }

export default function ChatRoomClient({ roomId, userId, role, school }: Props) {
  const [messages,    setMessages]    = useState<Message[]>([])
  const [roomInfo,    setRoomInfo]    = useState<any>(null)
  const [otherUser,   setOtherUser]   = useState<any>(null)
  const [text,        setText]        = useState('')
  const [loading,     setLoading]     = useState(true)
  const [emojiTarget, setEmojiTarget] = useState<string | null>(null)
  const [isOnline,    setIsOnline]    = useState(false)
  const [replyTo,     setReplyTo]     = useState<Message | null>(null)
  const [showMenu,    setShowMenu]    = useState(false)
  const [swipeId,     setSwipeId]     = useState<string | null>(null)
  const [swipeX,      setSwipeX]      = useState(0)
  const [kbOffset,    setKbOffset]    = useState(0)
  const [readIds,     setReadIds]     = useState<Set<string>>(new Set())

  // Attachment picked but not yet sent — shown in a preview sheet so people
  // can add a caption before it goes out (like WhatsApp's photo caption).
  const [pendingFile,    setPendingFile]    = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [pendingKind,    setPendingKind]    = useState<'image' | 'video' | 'file'>('file')
  const [caption,        setCaption]        = useState('')

  const router     = useRouter()
  const supabase   = createClient()
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const pageRef    = useRef<HTMLDivElement>(null)

  const queueRef      = useRef<QueueJob[]>([])
  const processingRef = useRef(false)
  const touchStart     = useRef<{ x: number; y: number; id: string } | null>(null)
  const swipeLocked     = useRef<'h' | 'v' | null>(null)
  const messageIdsRef   = useRef<Set<string>>(new Set())

  const schoolColor = school?.primary_color ?? '#7C3AED'

  // ── Bootstrap ────────────────────────────────────────────
  useEffect(() => {
    loadRoomAndUsers()
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
          // The room is open right now, so anything the other person just
          // sent counts as read immediately.
          if ((msg as Message).sender_id !== userId) markAsRead([(msg as Message).id])
        }
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public',
        table: 'chat_messages', filter: `room_id=eq.${roomId}`,
      }, payload => {
        setMessages(prev => prev.map(m =>
          m.id === payload.new.id ? { ...m, ...(payload.new as Message) } : m
        ))
      })
      // Someone (the other person) marked one of our messages as read —
      // flip that message's ticks from sent to seen.
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public',
        table: 'message_read_receipts',
      }, payload => {
        const receipt = payload.new as { message_id: string; user_id: string }
        if (receipt.user_id === userId) return // that's our own read, not theirs
        if (!messageIdsRef.current.has(receipt.message_id)) return // not this room
        setReadIds(ids => new Set(ids).add(receipt.message_id))
      })
      .on('presence', { event: 'sync' }, () => {
        const state = ch.presenceState()
        setIsOnline(Object.keys(state).length > 1)
      })
      .subscribe(async status => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ user_id: userId, online_at: new Date().toISOString() })
        }
      })

    return () => { supabase.removeChannel(ch) }
  }, [roomId])

  // Refresh read state whenever the tab regains focus while sitting on this room
  useEffect(() => {
    function onVisible() { if (document.visibilityState === 'visible') loadMessages() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Mark the other person's messages read, and pick up who's already read ours
  async function markAsRead(messageIds: string[]) {
    if (messageIds.length === 0) return
    const rows = messageIds.map(message_id => ({ message_id, user_id: userId }))
    await supabase
      .from('message_read_receipts')
      .upsert(rows, { onConflict: 'message_id,user_id', ignoreDuplicates: true })
  }

  async function loadReadReceipts(otherUserId: string) {
    const { data } = await supabase
      .from('message_read_receipts')
      .select('message_id, chat_messages!inner(room_id)')
      .eq('user_id', otherUserId)
      .eq('chat_messages.room_id', roomId)

    if (data) setReadIds(new Set(data.map((r: any) => r.message_id)))
  }


  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    messageIdsRef.current = new Set(messages.map(m => m.id))
  }, [messages])

  useEffect(() => {
    const handler = () => { setEmojiTarget(null); setShowMenu(false) }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // ── Keyboard-aware input bar ───────────────────────────────
  // .page already uses 100dvh so most modern mobile browsers reflow on their
  // own, but Android Chrome / older Safari fire visualViewport resize
  // *before* dvh settles — this keeps the input bar glued above the keyboard
  // in every case by nudging it with a CSS var instead of guessing layout.
  //
  // Only 'resize' is listened to here. visualViewport also fires 'scroll'
  // during ordinary page/list scrolling (not just keyboard show/hide) — that
  // was previously wired up too and caused every scroll gesture to
  // re-trigger the offset calc and snap the view back to the bottom,
  // which is why scrolling up felt broken.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function onViewportChange() {
      const offset = Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop)
      // Ignore tiny fluctuations (URL bar show/hide) — only react to a real keyboard
      setKbOffset(offset > 80 ? offset : 0)
    }

    vv.addEventListener('resize', onViewportChange)
    return () => vv.removeEventListener('resize', onViewportChange)
  }, [])

  const prevKbOffset = useRef(0)
  useEffect(() => {
    pageRef.current?.style.setProperty('--kb-offset', `${kbOffset}px`)
    // Only auto-scroll on the 0 → open transition, not every fluctuation,
    // so a person actively scrolling up isn't yanked back down.
    if (kbOffset > 0 && prevKbOffset.current === 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
    prevKbOffset.current = kbOffset
  }, [kbOffset])

  // ── Load room + other user (flat, separate queries) ──────
  async function loadRoomAndUsers() {
    const { data: room } = await supabase
      .from('chat_rooms')
      .select('id, name, room_type, is_group')
      .eq('id', roomId)
      .single()

    if (room) setRoomInfo(room)

    const { data: members } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .neq('user_id', userId)
      .limit(1)

    if (members?.[0]?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role')
        .eq('id', members[0].user_id)
        .single()

      if (profile) {
        setOtherUser(profile)
        loadReadReceipts(profile.id)
      }
    }
  }

  // ── Load messages ────────────────────────────────────────
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
      const enriched = msgs.map(m => {
        if (!m.reply_to_id) return m
        const parent = msgs.find(p => p.id === m.reply_to_id)
        if (!parent) return m
        return {
          ...m,
          reply_to: {
            content:     parent.is_deleted ? '🚫 Deleted' : displayLabel(parent),
            sender_name: parent.sender?.full_name ?? 'Unknown',
          },
        }
      })
      setMessages(enriched)
      const unreadFromOther = enriched.filter(m => m.sender_id !== userId).map(m => m.id)
      markAsRead(unreadFromOther)
    }
    setLoading(false)
  }

  // A message's content is the caption when there is one; this fills in a
  // plain label for uncaptioned media so previews/notifications never show
  // a blank line.
  function displayLabel(m: Message) {
    if (m.content?.trim()) return m.content
    if (m.file_type === 'image') return '🖼️ Photo'
    if (m.file_type === 'video') return '🎥 Video'
    return m.content ?? ''
  }

  function getRoomDisplayName() {
    if (otherUser?.full_name) return otherUser.full_name
    if (roomInfo?.is_group)   return roomInfo.name ?? 'Group Chat'
    return roomInfo?.name ?? 'Chat'
  }

  async function pushNotification(content: string) {
    if (!otherUser?.id) return
    try {
      await supabase.from('notifications').insert({
        user_id:  otherUser.id,
        title:    'New message',
        body:     content.length > 100 ? content.slice(0, 100) + '…' : content,
        type:     'chat',
        link_url: `/dashboard/${otherUser.role}/chat/${roomId}`,
      })
    } catch (_) { /* notification failure must never break message sending */ }
  }

  // ── QUEUE: enqueue + background processor ──────────────────
  // Sends never block the input — press send/attach and keep typing/tapping
  // the next thing. Jobs run one at a time in the background; failures show
  // a retry affordance instead of silently vanishing.
  function enqueue(job: QueueJob) {
    queueRef.current.push(job)
    processQueue()
  }

  async function processQueue() {
    if (processingRef.current) return
    processingRef.current = true

    while (queueRef.current.length > 0) {
      const job = queueRef.current.shift()!
      try {
        if (job.kind === 'text') await runTextJob(job)
        else await runFileJob(job)
      } catch {
        setMessages(prev => prev.map(m =>
          m.id === job.tempId ? { ...m, _status: 'failed' } : m
        ))
      }
    }

    processingRef.current = false
  }

  async function runTextJob(job: Extract<QueueJob, { kind: 'text' }>) {
    const insertData: any = { room_id: roomId, sender_id: userId, content: job.content }
    if (job.replyId) insertData.reply_to_id = job.replyId

    const { data: newMsg, error } = await supabase
      .from('chat_messages')
      .insert(insertData)
      .select('*, sender:profiles(full_name, avatar_url)')
      .single()

    if (error || !newMsg) {
      setMessages(prev => prev.map(m => m.id === job.tempId ? { ...m, _status: 'failed' } : m))
      return
    }
    setMessages(prev => prev.map(m => m.id === job.tempId ? { ...(newMsg as Message), _status: 'sent' } : m))
    pushNotification(job.content)
  }

  async function runFileJob(job: Extract<QueueJob, { kind: 'file' }>) {
    const { file, tempId, caption } = job
    const ext      = file.name.split('.').pop()
    const isImage  = file.type.startsWith('image/')
    const isVideo  = file.type.startsWith('video/')
    const bucket   = isImage ? 'chat-images' : isVideo ? 'chat-videos' : 'chat-files'
    const fileType = isImage ? 'image' : isVideo ? 'video' : 'file'
    const fallback = isImage ? '🖼️ Image' : isVideo ? '🎥 Video' : `📎 ${file.name}`
    // If the person wrote a caption it becomes the message content; otherwise
    // leave content blank and fall back to a plain label wherever content
    // needs to stand alone (reply previews, notifications).
    const content  = caption.trim() || (fileType === 'file' ? fallback : null)
    const fname    = `files/${userId}/${Date.now()}.${ext}`

    // Simulated progress while the upload is in flight — supabase-js's
    // storage client doesn't expose real byte progress, so this gives
    // the person visible motion instead of a frozen spinner.
    let fakeProgress = 8
    const tick = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + Math.random() * 18, 92)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _progress: fakeProgress } : m))
    }, 220)

    const { error: uploadError } = await supabase.storage.from(bucket).upload(fname, file)
    let finalBucket = bucket
    if (uploadError) {
      const { error: fallbackError } = await supabase.storage.from('chat-files').upload(fname, file)
      if (fallbackError) {
        clearInterval(tick)
        setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m))
        return
      }
      finalBucket = 'chat-files'
    }

    const { data: urlData } = supabase.storage.from(finalBucket).getPublicUrl(fname)

    const { data: newMsg, error: insertError } = await supabase
      .from('chat_messages')
      .insert({ room_id: roomId, sender_id: userId, content, file_url: urlData.publicUrl, file_type: fileType })
      .select('*, sender:profiles(full_name, avatar_url)')
      .single()

    clearInterval(tick)

    if (insertError || !newMsg) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed', _progress: 100 } : m))
      return
    }
    setMessages(prev => prev.map(m => m.id === tempId ? { ...(newMsg as Message), _status: 'sent' } : m))
    pushNotification(content || fallback)
  }

  function retry(msg: Message) {
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, _status: msg.file_url ? 'uploading' : 'sending', _progress: 0 } : m))
    if (msg.file_url) return // failed uploads that already produced a url are effectively sent — nothing to retry
    enqueue({ kind: 'text', tempId: msg.id, content: msg.content, replyId: msg.reply_to_id ?? null })
  }

  // ── Send text ────────────────────────────────────────────
  function sendText() {
    if (!text.trim()) return
    const content = text.trim()
    const replyId = replyTo?.id ?? null
    const tempId  = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    setText('')
    setReplyTo(null)
    inputRef.current?.focus()

    const temp: Message = {
      id: tempId, content, sender_id: userId,
      sent_at: new Date().toISOString(),
      is_deleted: false, is_edited: false,
      reply_to_id: replyId,
      reply_to: replyTo ? {
        content:     replyTo.is_deleted ? '🚫 Deleted' : displayLabel(replyTo),
        sender_name: replyTo.sender?.full_name ?? 'Unknown',
      } : null,
      _status: 'sending',
    }
    setMessages(prev => [...prev, temp])
    enqueue({ kind: 'text', tempId, content, replyId })
  }

  // ── Pick a file → show caption preview (doesn't send yet) ────
  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')
    setPendingFile(file)
    setPendingKind(isImage ? 'image' : isVideo ? 'video' : 'file')
    setPendingPreview((isImage || isVideo) ? URL.createObjectURL(file) : null)
    setCaption('')
  }

  function cancelPendingFile() {
    if (pendingPreview) URL.revokeObjectURL(pendingPreview)
    setPendingFile(null)
    setPendingPreview(null)
    setCaption('')
  }

  // ── Confirm from the caption sheet → actually queue the send ─
  function confirmSendFile() {
    if (!pendingFile) return
    const file    = pendingFile
    const fileType = pendingKind
    const capText = caption
    const tempId  = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const localUrl = pendingPreview ?? undefined

    const temp: Message = {
      id: tempId,
      content: capText.trim() || (fileType === 'file' ? `📎 ${file.name}` : ''),
      sender_id: userId, sent_at: new Date().toISOString(),
      is_deleted: false, is_edited: false,
      file_url: localUrl, file_type: fileType,
      _status: 'uploading', _progress: 5,
    }
    setMessages(prev => [...prev, temp])
    enqueue({ kind: 'file', tempId, file, caption: capText })

    setPendingFile(null)
    setPendingPreview(null)
    setCaption('')
  }

  // ── Reactions ────────────────────────────────────────────
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
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions } : m))
    setEmojiTarget(null)
    await supabase.from('chat_messages').update({ reactions }).eq('id', msgId)
  }

  // ── Delete ───────────────────────────────────────────────
  async function deleteMessage(msgId: string) {
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, is_deleted: true, content: '🚫 This message was deleted' } : m
    ))
    await supabase
      .from('chat_messages')
      .update({ is_deleted: true, content: '🚫 This message was deleted' })
      .eq('id', msgId).eq('sender_id', userId)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  // ── Swipe-to-reply ───────────────────────────────────────
  // The CSS already scaffolds this (.msgGroup has overflow:visible and a
  // centered .replyIndicator) — this wires up the actual touch drag.
  // Drag the row sideways — past SWIPE_TRIGGER, release to reply. Vertical
  // scrolling is left untouched: the gesture only engages once horizontal
  // movement clearly outpaces vertical movement.
  function onTouchStart(msg: Message, e: React.TouchEvent) {
    if (msg.is_deleted) return
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY, id: msg.id }
    swipeLocked.current = null
    setSwipeId(msg.id)
    setSwipeX(0)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y

    if (swipeLocked.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        swipeLocked.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
      }
    }
    if (swipeLocked.current !== 'h') return

    e.preventDefault()
    // Only reveal rightward (WhatsApp-style) — reads naturally for both
    // sides since .msgGroupMe is row-reversed but translateX is absolute.
    const clamped = Math.max(0, Math.min(SWIPE_MAX, dx))
    setSwipeX(clamped)
  }

  function onTouchEnd() {
    if (!touchStart.current) return
    const msg = messages.find(m => m.id === touchStart.current!.id)
    if (msg && swipeX >= SWIPE_TRIGGER) {
      setReplyTo(msg)
      setTimeout(() => inputRef.current?.focus(), 80)
      if (navigator.vibrate) navigator.vibrate(12)
    }
    touchStart.current = null
    swipeLocked.current = null
    setSwipeId(null)
    setSwipeX(0)
  }

  function formatTime(d: string) {
    return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  function formatDate(d: string) {
    const date = new Date(d), today = new Date(), yesterday = new Date(today)
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

  const displayName = getRoomDisplayName()

  // ── Render ───────────────────────────────────────────────
  return (
    <div className={styles.page} ref={pageRef}>

      {/* ── HEADER ─────────────────────────────────────── */}
      <header className={styles.header}>
        <button
          className={styles.backBtn}
          onClick={() => router.push(`/dashboard/${role}/chat`)}
        >
          <ArrowLeftIcon size={20} />
        </button>
        <div className={styles.roomInfo}>
          <div className={styles.roomAvatar} style={{ background: schoolColor }}>
            {otherUser?.avatar_url
              ? <img src={otherUser.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
              : <span style={{ color:'#fff', fontWeight:700, fontSize:'1rem' }}>
                  {displayName[0]?.toUpperCase() ?? '#'}
                </span>
            }
          </div>
          <div style={{ minWidth:0, flex:1 }}>
            <p className={styles.roomName}>{displayName}</p>
            <p className={styles.roomMeta} style={{ color: isOnline ? '#22c55e' : undefined }}>
              {isOnline ? '● Online' : (otherUser?.role ?? '')}
            </p>
          </div>
        </div>
        <button className={styles.moreBtn}
          onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}>
          <MoreIcon size={20} />
        </button>
        {showMenu && (
          <div className={styles.headerMenu} onClick={e => e.stopPropagation()}>
            <button onClick={() => { loadMessages(); setShowMenu(false) }}>🔄 Refresh</button>
            <button onClick={() => router.push(`/dashboard/${role}/chat`)}>📋 All chats</button>
          </div>
        )}
      </header>

      {/* ── MESSAGES ───────────────────────────────────── */}
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
              const dragging    = swipeId === msg.id
              const dragX       = dragging ? swipeX : 0
              const showReplyCue = dragging && swipeX > 12

              return (
                <div
                  key={msg.id}
                  className={`${styles.msgGroup} ${isMe ? styles.msgGroupMe : ''} ${dragging ? styles.msgGroupDragging : ''}`}
                  onTouchStart={e => onTouchStart(msg, e)}
                  onTouchMove={onTouchMove}
                  onTouchEnd={onTouchEnd}
                >
                  {/* Centered swipe-to-reply cue — fades/scales in past the trigger distance */}
                  <span className={`${styles.replyIndicator} ${showReplyCue ? styles.replyIndicatorVisible : ''}`}>
                    ↩
                  </span>

                  {!isMe && (
                    <div className={styles.avatarCol} style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}>
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

                  <div className={styles.bubbleCol} style={{ transform: dragX ? `translateX(${dragX}px)` : undefined }}>
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
                      className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem} ${msg._status === 'failed' ? styles.bubbleFailed : ''}`}
                      style={isMe ? { background: schoolColor } : undefined}
                      onDoubleClick={e => { e.stopPropagation(); setEmojiTarget(emojiTarget === msg.id ? null : msg.id) }}
                    >
                      {msg.file_type === 'image' && msg.file_url && (
                        <div className={styles.mediaWrap}>
                          <img src={msg.file_url} alt="Image" className={styles.msgImage}
                            onClick={() => msg._status !== 'uploading' && window.open(msg.file_url!, '_blank')} />
                          {msg._status === 'uploading' && (
                            <div className={styles.mediaOverlay}>
                              <div className={styles.spinner} />
                              <span>{Math.round(msg._progress ?? 0)}%</span>
                            </div>
                          )}
                        </div>
                      )}
                      {msg.file_type === 'video' && msg.file_url && (
                        <div className={styles.mediaWrap}>
                          <video src={msg.file_url} controls={msg._status !== 'uploading'} className={styles.msgVideo} playsInline />
                          {msg._status === 'uploading' && (
                            <div className={styles.mediaOverlay}>
                              <div className={styles.spinner} />
                              <span>{Math.round(msg._progress ?? 0)}%</span>
                            </div>
                          )}
                        </div>
                      )}
                      {(msg.file_type === 'image' || msg.file_type === 'video') && msg.content?.trim() && (
                        <p className={styles.captionText}>{msg.content}</p>
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
                        {isMe && msg._status === 'sending' && <span className={styles.msgClock}>🕐</span>}
                        {isMe && msg._status === 'uploading' && <span className={styles.msgClock}>⬆</span>}
                        {isMe && (msg._status === 'sent' || !msg._status) && (
                          <span className={`${styles.msgCheck} ${readIds.has(msg.id) ? styles.msgCheckSeen : ''}`}>✓✓</span>
                        )}
                        {isMe && msg._status === 'failed' && (
                          <button className={styles.retryBtn} onClick={e => { e.stopPropagation(); retry(msg) }}>
                            ⚠ retry
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Reactions */}
                    {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                      <div className={styles.reactions}>
                        {Object.entries(msg.reactions).map(([emoji, users]) =>
                          users.length > 0 ? (
                            <button key={emoji}
                              className={`${styles.reaction} ${users.includes(userId) ? styles.reactionMe : ''}`}
                              style={users.includes(userId) ? { borderColor: schoolColor } : undefined}
                              onClick={() => addReaction(msg.id, emoji)}>
                              {emoji} {users.length}
                            </button>
                          ) : null
                        )}
                      </div>
                    )}

                    {/* Action buttons — always visible on touch, hover-reveal on desktop via CSS */}
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
                      <div className={`${styles.emojiPicker} ${isMe ? styles.emojiPickerMe : ''}`}
                        onClick={e => e.stopPropagation()}>
                        {EMOJIS.map(e => (
                          <button key={e} className={styles.emojiBtn}
                            onClick={() => addReaction(msg.id, e)}>{e}</button>
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

      {/* ── REPLY BANNER ───────────────────────────────── */}
      {replyTo && (
        <div className={styles.replyBanner}>
          <div className={styles.replyBannerBar} style={{ background: schoolColor }} />
          <div className={styles.replyBannerContent}>
            <p className={styles.replyBannerAuthor} style={{ color: schoolColor }}>
              Replying to {replyTo.sender?.full_name ?? 'message'}
            </p>
            <p className={styles.replyBannerText}>
              {replyTo.is_deleted ? '🚫 Deleted message' : displayLabel(replyTo)}
            </p>
          </div>
          <button className={styles.replyBannerClose} onClick={() => setReplyTo(null)}>
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* ── ATTACHMENT PREVIEW — add a caption before it actually sends ── */}
      {pendingFile && (
        <div className={styles.attachSheet}>
          <div className={styles.attachSheetHeader}>
            <span>Send {pendingKind === 'image' ? 'photo' : pendingKind === 'video' ? 'video' : 'file'}</span>
            <button className={styles.attachSheetClose} onClick={cancelPendingFile}>
              <XIcon size={16} />
            </button>
          </div>
          <div className={styles.attachPreviewBody}>
            {pendingKind === 'image' && pendingPreview && (
              <img src={pendingPreview} alt="Preview" className={styles.attachPreviewImg} />
            )}
            {pendingKind === 'video' && pendingPreview && (
              <video src={pendingPreview} className={styles.attachPreviewVideo} controls playsInline />
            )}
            {pendingKind === 'file' && (
              <div className={styles.attachPreviewFile}>📎 {pendingFile.name}</div>
            )}
          </div>
          <div className={styles.attachCaptionRow}>
            <input
              className={styles.attachCaptionInput}
              value={caption}
              onChange={e => setCaption(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && confirmSendFile()}
              placeholder="Add a caption..."
              autoFocus
            />
            <button className={styles.attachSendBtn} style={{ background: schoolColor }} onClick={confirmSendFile}>
              <SendIcon size={16} color="white" />
            </button>
          </div>
        </div>
      )}

      {/* ── INPUT BAR — nudged above the keyboard via --kb-offset ── */}
      <div className={styles.inputBar} style={{ transform: kbOffset ? `translateY(-${kbOffset}px)` : undefined }}>
        <input ref={fileRef} type="file" className={styles.fileInput} onChange={pickFile}
          accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />
        <button className={styles.attachBtn} onClick={() => fileRef.current?.click()} title="Attach">
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
          style={{ background: schoolColor, opacity: !text.trim() ? 0.5 : 1 }}
          onClick={sendText}
          disabled={!text.trim()}
        >
          <SendIcon size={16} color="white" />
        </button>
      </div>
    </div>
  )
}
