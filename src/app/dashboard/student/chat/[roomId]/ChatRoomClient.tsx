'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import {
  SendIcon, PaperclipIcon,
  ArrowLeftIcon, SmileIcon, MoreIcon, XIcon,
  BanIcon, PeopleIcon, UserIcon, RefreshIcon, ClockIcon,
  UploadIcon, CheckIcon, AlertIcon, EditIcon, TrashIcon, LockIcon, MessageIcon,
  MicIcon, StopIcon, StickerIcon, CrownIcon, PlusIcon, SearchIcon,
} from '@/components/Icons'
import motion from '@/components/dashboard-motion.module.css'
import styles from './chat-room.module.css'
import { logActivity } from '@/lib/logActivity'

// REDESIGN PASS (Lane 3 - Student): all chrome/status emoji converted to
// Icons.tsx components below. The EMOJIS reaction-picker array a few lines
// down stays untouched - per EMOJI-ICON-MAP.md, emoji used as actual chat
// reactions are the one exception to the conversion.

interface Message {
  id:           string
  content:      string
  sender_id:    string
  sent_at:      string
  file_url?:    string | null
  file_type?:   string | null
  duration_seconds?: number | null
  is_deleted:   boolean
  is_edited:    boolean
  reactions?:   Record<string, string[]>
  reply_to_id?: string | null
  reply_to?:    { content: string; sender_name: string } | null
  sender?:      { full_name: string; avatar_url?: string }
  // client-only fields - never sent to the server
  _status?:     'sending' | 'uploading' | 'sent' | 'failed'
  _progress?:   number
}

interface Props {
  roomId:  string
  userId:  string
  role:    string
  school?: any
}

// Same palette UniversalChatPage.tsx uses for role-colored avatars, kept in
// sync manually since the two components don't share a constants module.
const ROLE_COLORS: Record<string, string> = {
  student:   '#3B82F6',
  teacher:   '#10B981',
  principal: '#8B5CF6',
  bursar:    '#F59E0B',
  secretary: '#EC4899',
  parent:    '#F97316',
}

const EMOJIS = ['👍','❤️','😂','😮','😢','🔥','👏','🎉']
const SWIPE_TRIGGER = 46   // px of drag before "release to reply" fires
const SWIPE_MAX     = 68   // px cap on how far the bubble can travel

// Original sticker artwork shipped with the app (public/stickers) - not
// user uploads, so sending one is a plain insert, no storage round trip.
const STICKERS = [
  { id: 'laugh-cry',  src: '/stickers/laugh-cry.svg',  alt: 'Laughing with tears' },
  { id: 'mind-blown', src: '/stickers/mind-blown.svg', alt: 'Mind blown' },
  { id: 'cool',       src: '/stickers/cool.svg',       alt: 'Cool with sunglasses' },
  { id: 'heart-eyes', src: '/stickers/heart-eyes.svg', alt: 'Heart eyes' },
  { id: 'side-eye',   src: '/stickers/side-eye.svg',   alt: 'Side eye' },
  { id: 'shocked',    src: '/stickers/shocked.svg',    alt: 'Shocked' },
  { id: 'party',      src: '/stickers/party.svg',      alt: 'Party' },
  { id: 'facepalm',   src: '/stickers/facepalm.svg',   alt: 'Facepalm' },
]

// ── Background send queue ─────────────────────────────────────────────────
// Text + file sends are pushed here and processed one at a time in the
// background so the UI never blocks and multiple sends never race.
type QueueJob =
  | { kind: 'text'; tempId: string; content: string; replyId: string | null }
  | { kind: 'file'; tempId: string; file: File; caption: string }
  | { kind: 'voice'; tempId: string; blob: Blob; durationSeconds: number }
  | { kind: 'sticker'; tempId: string; url: string }

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
  const [contextMenuId, setContextMenuId] = useState<string | null>(null)
  const [editingId,     setEditingId]     = useState<string | null>(null)
  const [showProfile,   setShowProfile]   = useState(false)
  const [memberCount,   setMemberCount]   = useState(0)
  const [isModerator,   setIsModerator]   = useState(false)
  const [savingMode,    setSavingMode]    = useState(false)

  // Attachment picked but not yet sent - shown in a preview sheet so people
  // can add a caption before it goes out (like WhatsApp's photo caption).
  const [pendingFile,    setPendingFile]    = useState<File | null>(null)
  const [pendingPreview, setPendingPreview] = useState<string | null>(null)
  const [pendingKind,    setPendingKind]    = useState<'image' | 'video' | 'file'>('file')
  const [caption,        setCaption]        = useState('')

  // Voice note recording -> preview (mirrors the attach-then-caption flow above)
  const [isRecording,     setIsRecording]     = useState(false)
  const [recordSeconds,   setRecordSeconds]   = useState(0)
  const [voiceBlob,       setVoiceBlob]       = useState<Blob | null>(null)
  const [voicePreviewUrl, setVoicePreviewUrl] = useState<string | null>(null)
  const [voiceError,      setVoiceError]      = useState('')

  // Sticker picker
  const [showStickers, setShowStickers] = useState(false)

  // Peer-group management - only meaningful when roomInfo.room_type === 'peer_group'
  const [isGroupAdmin,     setIsGroupAdmin]     = useState(false)
  const [groupMembers,     setGroupMembers]     = useState<any[]>([])
  const [showAddMember,    setShowAddMember]    = useState(false)
  const [memberSearch,     setMemberSearch]     = useState('')
  const [memberResults,    setMemberResults]    = useState<any[]>([])
  const [memberSearching,  setMemberSearching]  = useState(false)
  const [groupNameEdit,    setGroupNameEdit]    = useState(false)
  const [groupNameInput,   setGroupNameInput]   = useState('')
  const [groupActionError, setGroupActionError] = useState('')
  const [groupActionBusy,  setGroupActionBusy]  = useState(false)

  const router     = useRouter()
  const supabase   = createClient()
  const bottomRef  = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)
  const fileRef    = useRef<HTMLInputElement>(null)
  const pageRef    = useRef<HTMLDivElement>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef   = useRef<Blob[]>([])
  const recordTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const recordStreamRef  = useRef<MediaStream | null>(null)

  const queueRef      = useRef<QueueJob[]>([])
  const processingRef = useRef(false)
  const touchStart     = useRef<{ x: number; y: number; id: string } | null>(null)
  const swipeLocked     = useRef<'h' | 'v' | null>(null)
  const messageIdsRef   = useRef<Set<string>>(new Set())
  const longPressTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const longPressFired  = useRef(false)
  // Guards against the "ghost click": on touch devices, when the long-press
  // timer opens the context menu WHILE the finger is still down, lifting the
  // finger fires a trailing click at that same point. Since the menu now
  // covers that point, that click would otherwise close the menu instantly - // this flag swallows exactly that one click.
  const suppressNextCloseClick = useRef(false)

  const schoolColor = school?.primary_color ?? '#800020'

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
      // Someone (the other person) marked one of our messages as read - // flip that message's ticks from sent to seen.
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

  // Leaving the room mid-recording must not leave the mic hot in the background.
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) clearInterval(recordTimerRef.current)
      recordStreamRef.current?.getTracks().forEach(t => t.stop())
      if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const handler = () => {
      if (suppressNextCloseClick.current) { suppressNextCloseClick.current = false; return }
      setEmojiTarget(null); setShowMenu(false); setContextMenuId(null); setShowStickers(false)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  // ── Keyboard-aware input bar ───────────────────────────────
  // .page already uses 100dvh so most modern mobile browsers reflow on their
  // own, but Android Chrome / older Safari fire visualViewport resize
  // *before* dvh settles - this keeps the input bar glued above the keyboard
  // in every case by nudging it with a CSS var instead of guessing layout.
  //
  // Only 'resize' is listened to here. visualViewport also fires 'scroll'
  // during ordinary page/list scrolling (not just keyboard show/hide) - that
  // was previously wired up too and caused every scroll gesture to
  // re-trigger the offset calc and snap the view back to the bottom,
  // which is why scrolling up felt broken.
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    function onViewportChange() {
      const offset = Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop)
      // Ignore tiny fluctuations (URL bar show/hide) - only react to a real keyboard
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
      .select('id, name, room_type, is_group, posting_mode, class_id, school_id, created_by')
      .eq('id', roomId)
      .single()

    if (!room) return
    setRoomInfo(room)

    if (room.is_group) {
      const { count } = await supabase
        .from('chat_room_members')
        .select('user_id', { count: 'exact', head: true })
        .eq('room_id', roomId)
      setMemberCount(count ?? 0)

      if (room.room_type === 'peer_group') {
        const { data: myMembership } = await supabase
          .from('chat_room_members')
          .select('role')
          .eq('room_id', roomId).eq('user_id', userId)
          .maybeSingle()
        setIsGroupAdmin(myMembership?.role === 'admin')
        return
      }

      const { data: mod } = await supabase.rpc('is_room_moderator', { _room_id: roomId, _user_id: userId })
      setIsModerator(!!mod)
      return
    }

    // Plain 1:1 DM - find the other participant
    const { data: members } = await supabase
      .from('chat_room_members')
      .select('user_id')
      .eq('room_id', roomId)
      .neq('user_id', userId)
      .limit(1)

    if (members?.[0]?.user_id) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, role, default_code, school_id')
        .eq('id', members[0].user_id)
        .single()

      if (profile) {
        setOtherUser(profile)
        loadReadReceipts(profile.id)
      }
    }
  }

  // ── Group settings: who can post ─────────────────────────
  async function updatePostingMode(mode: 'everyone' | 'moderators_only') {
    if (!roomInfo || savingMode || roomInfo.posting_mode === mode) return
    setSavingMode(true)
    setRoomInfo((prev: any) => ({ ...prev, posting_mode: mode }))
    await supabase.from('chat_rooms').update({ posting_mode: mode }).eq('id', roomId)
    setSavingMode(false)
  }

  // ── Peer group management (create_peer_group's siblings) ────────────
  async function loadGroupMembers() {
    const { data: members } = await supabase
      .from('chat_room_members')
      .select('user_id, role')
      .eq('room_id', roomId)

    if (!members?.length) { setGroupMembers([]); return }

    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, role, default_code')
      .in('id', members.map(m => m.user_id))

    const roleByUser = new Map(members.map(m => [m.user_id, m.role]))
    const merged = (profiles ?? [])
      .map(p => ({ ...p, groupRole: roleByUser.get(p.id) ?? 'member' }))
      .sort((a, b) => (a.groupRole === b.groupRole ? 0 : a.groupRole === 'admin' ? -1 : 1))
    setGroupMembers(merged)
  }

  useEffect(() => {
    if (showProfile && roomInfo?.room_type === 'peer_group') loadGroupMembers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showProfile, roomInfo?.room_type])

  async function searchMembersToAdd(query: string) {
    setMemberSearching(true)
    const existingIds = new Set(groupMembers.map(m => m.id))
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, school_id')
      .or(`full_name.ilike.%${query}%,default_code.ilike.%${query.toUpperCase()}%`)
      .eq('school_id', school?.id)
      .limit(8)
    setMemberResults((data ?? []).filter(u => !existingIds.has(u.id)))
    setMemberSearching(false)
  }

  useEffect(() => {
    if (!showAddMember) { setMemberResults([]); return }
    const trimmed = memberSearch.trim()
    if (trimmed.length < 2) { setMemberResults([]); return }
    const handle = setTimeout(() => searchMembersToAdd(trimmed), 250)
    return () => clearTimeout(handle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberSearch, showAddMember])

  async function addMemberToGroup(memberId: string) {
    setGroupActionBusy(true)
    setGroupActionError('')
    const { error } = await supabase.rpc('add_group_member', { _room_id: roomId, _user_id: memberId })
    if (error) {
      setGroupActionError(error.message)
    } else {
      setMemberSearch('')
      setMemberResults([])
      await loadGroupMembers()
      setMemberCount(c => c + 1)
    }
    setGroupActionBusy(false)
  }

  async function removeMemberFromGroup(memberId: string) {
    setGroupActionBusy(true)
    setGroupActionError('')
    const { error } = await supabase.rpc('remove_group_member', { _room_id: roomId, _user_id: memberId })
    if (error) {
      setGroupActionError(error.message)
    } else {
      setGroupMembers(prev => prev.filter(m => m.id !== memberId))
      setMemberCount(c => Math.max(0, c - 1))
    }
    setGroupActionBusy(false)
  }

  async function leaveGroup() {
    setGroupActionBusy(true)
    setGroupActionError('')
    const { error } = await supabase.rpc('leave_peer_group', { _room_id: roomId })
    if (error) {
      setGroupActionError(error.message)
      setGroupActionBusy(false)
      return
    }
    router.push(`/dashboard/${role}/chat`)
  }

  async function saveGroupName() {
    if (!groupNameInput.trim()) return
    setGroupActionBusy(true)
    setGroupActionError('')
    const { error } = await supabase.rpc('rename_peer_group', { _room_id: roomId, _new_name: groupNameInput.trim() })
    if (error) {
      setGroupActionError(error.message)
    } else {
      setRoomInfo((prev: any) => ({ ...prev, name: groupNameInput.trim() }))
      setGroupNameEdit(false)
    }
    setGroupActionBusy(false)
  }

  function closeProfileCard() {
    setShowProfile(false)
    setShowAddMember(false)
    setMemberSearch('')
    setGroupNameEdit(false)
    setGroupActionError('')
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
            content:     parent.is_deleted ? 'Deleted' : displayLabel(parent),
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
    if (m.file_type === 'image')   return 'Photo'
    if (m.file_type === 'video')   return 'Video'
    if (m.file_type === 'voice')   return `Voice message${m.duration_seconds ? ` (${formatDuration(m.duration_seconds)})` : ''}`
    if (m.file_type === 'sticker') return 'Sticker'
    return m.content ?? ''
  }

  function groupTypeLabel() {
    if (roomInfo?.room_type === 'school_group') return 'School Community'
    if (roomInfo?.room_type === 'peer_group')   return 'Group'
    return 'Class Group'
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
  // Sends never block the input - press send/attach and keep typing/tapping
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
        else if (job.kind === 'file') await runFileJob(job)
        else if (job.kind === 'voice') await runVoiceJob(job)
        else await runStickerJob(job)
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
    const fallback = isImage ? 'Photo' : isVideo ? 'Video' : file.name
    // If the person wrote a caption it becomes the message content; otherwise
    // leave content blank and fall back to a plain label wherever content
    // needs to stand alone (reply previews, notifications).
    const content  = caption.trim() || (fileType === 'file' ? fallback : null)
    const fname    = `files/${userId}/${Date.now()}.${ext}`

    // Simulated progress while the upload is in flight - supabase-js's
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

    // Log as activity only for file/photo/video shares, not plain text - // recent_activities shows the last 15 items across the whole account,
    // and someone in an active text conversation could easily send more
    // than that in a single sitting. A shared file is a much rarer,
    // genuinely activity-worthy event than routine text chatter.
    if (school?.id) {
      logActivity({
        userId, schoolId: school.id,
        type:  'message_sent',
        title: `Shared a ${fileType} with ${otherUser?.full_name ?? 'someone'}`,
        href:  `/dashboard/${role}/chat/${roomId}`,
      })
    }
  }

  // Voice notes upload to their own bucket, otherwise this mirrors runFileJob
  // exactly - same optimistic temp bubble, same fake-progress ticker, same
  // fallback-to-chat-files behavior if the dedicated bucket write fails.
  async function runVoiceJob(job: Extract<QueueJob, { kind: 'voice' }>) {
    const { blob, tempId, durationSeconds } = job
    const ext   = blob.type.includes('mp4') ? 'm4a' : blob.type.includes('ogg') ? 'ogg' : 'webm'
    const fname = `files/${userId}/${Date.now()}.${ext}`

    let fakeProgress = 8
    const tick = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + Math.random() * 18, 92)
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _progress: fakeProgress } : m))
    }, 220)

    const { error: uploadError } = await supabase.storage.from('chat-voice').upload(fname, blob, {
      contentType: blob.type || 'audio/webm',
    })
    let finalBucket = 'chat-voice'
    if (uploadError) {
      const { error: fallbackError } = await supabase.storage.from('chat-files').upload(fname, blob, {
        contentType: blob.type || 'audio/webm',
      })
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
      .insert({
        room_id: roomId, sender_id: userId,
        file_url: urlData.publicUrl, file_type: 'voice',
        duration_seconds: durationSeconds,
      })
      .select('*, sender:profiles(full_name, avatar_url)')
      .single()

    clearInterval(tick)

    if (insertError || !newMsg) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed', _progress: 100 } : m))
      return
    }
    setMessages(prev => prev.map(m => m.id === tempId ? { ...(newMsg as Message), _status: 'sent' } : m))
    pushNotification('Voice message')
  }

  // Stickers reference a static asset already shipped with the app, so
  // there's nothing to upload - this is a plain insert, same queue pattern
  // as runTextJob so it gets the same retry-on-failure behavior.
  async function runStickerJob(job: Extract<QueueJob, { kind: 'sticker' }>) {
    const { url, tempId } = job

    const { data: newMsg, error } = await supabase
      .from('chat_messages')
      .insert({ room_id: roomId, sender_id: userId, file_url: url, file_type: 'sticker' })
      .select('*, sender:profiles(full_name, avatar_url)')
      .single()

    if (error || !newMsg) {
      setMessages(prev => prev.map(m => m.id === tempId ? { ...m, _status: 'failed' } : m))
      return
    }
    setMessages(prev => prev.map(m => m.id === tempId ? { ...(newMsg as Message), _status: 'sent' } : m))
    pushNotification('Sent a sticker')
  }

  function retry(msg: Message) {
    // Stickers point at a permanent static asset (never a temporary blob
    // preview), so unlike uploaded files this can genuinely be resent.
    if (msg.file_type === 'sticker' && msg.file_url) {
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, _status: 'sending', _progress: 0 } : m))
      enqueue({ kind: 'sticker', tempId: msg.id, url: msg.file_url! })
      return
    }
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, _status: msg.file_url ? 'uploading' : 'sending', _progress: 0 } : m))
    if (msg.file_url) return // failed uploads that already produced a url are effectively sent - nothing to retry
    enqueue({ kind: 'text', tempId: msg.id, content: msg.content, replyId: msg.reply_to_id ?? null })
  }

  // ── Send text ────────────────────────────────────────────
  function sendText() {
    if (!text.trim()) return
    if (editingId) { saveEdit(); return }

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
        content:     replyTo.is_deleted ? 'Deleted' : displayLabel(replyTo),
        sender_name: replyTo.sender?.full_name ?? 'Unknown',
      } : null,
      _status: 'sending',
    }
    setMessages(prev => [...prev, temp])
    enqueue({ kind: 'text', tempId, content, replyId })
  }

  // ── Edit an existing message ─────────────────────────────
  function startEdit(msg: Message) {
    if (msg.file_type || msg.is_deleted) return // captions/files aren't editable here, just plain text
    setEditingId(msg.id)
    setReplyTo(null)
    setText(msg.content ?? '')
    setContextMenuId(null)
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  function cancelEdit() {
    setEditingId(null)
    setText('')
  }

  async function saveEdit() {
    if (!editingId) return
    const newContent = text.trim()
    const msgId = editingId
    const original = messages.find(m => m.id === msgId)
    setText('')
    setEditingId(null)

    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, content: newContent, is_edited: true } : m
    ))
    const { error } = await supabase
      .from('chat_messages')
      .update({ content: newContent, is_edited: true, edited_at: new Date().toISOString() })
      .eq('id', msgId).eq('sender_id', userId)

    if (error && original) {
      // edit didn't actually persist - put the original content back so
      // the UI doesn't show an edit that isn't real
      setMessages(prev => prev.map(m => m.id === msgId ? original : m))
    }
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
      content: capText.trim() || (fileType === 'file' ? file.name : ''),
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
    const originalReactions = msg.reactions
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
    const { error } = await supabase.from('chat_messages').update({ reactions }).eq('id', msgId)
    if (error) {
      setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reactions: originalReactions } : m))
    }
  }

  // ── Delete ───────────────────────────────────────────────
  async function deleteMessage(msgId: string) {
    setContextMenuId(null)
    const original = messages.find(m => m.id === msgId)
    setMessages(prev => prev.map(m =>
      m.id === msgId ? { ...m, is_deleted: true, content: 'This message was deleted' } : m
    ))
    const { error } = await supabase
      .from('chat_messages')
      .update({ is_deleted: true, content: 'This message was deleted' })
      .eq('id', msgId).eq('sender_id', userId)
    if (error && original) {
      setMessages(prev => prev.map(m => m.id === msgId ? original : m))
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  // ── Swipe-to-reply + long-press context menu ────────────
  // The CSS already scaffolds swipe (.msgGroup has overflow:visible and a
  // centered .replyIndicator) - this wires up the actual touch drag.
  // Drag the row sideways - past SWIPE_TRIGGER, release to reply. Vertical
  // scrolling is left untouched: the gesture only engages once horizontal
  // movement clearly outpaces vertical movement.
  //
  // A long-press (no meaningful movement for ~450ms) opens a context menu
  // with Reply / React / Edit / Delete. Those action buttons are hover-only
  // and hidden entirely on mobile - swipe alone only covers reply, so
  // edit/delete/react had no touch affordance at all before this.
  function onTouchStart(msg: Message, e: React.TouchEvent) {
    if (msg.is_deleted) return
    const t = e.touches[0]
    touchStart.current = { x: t.clientX, y: t.clientY, id: msg.id }
    swipeLocked.current = null
    setSwipeId(msg.id)
    setSwipeX(0)

    longPressFired.current = false
    if (longPressTimer.current) clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      touchStart.current = null
      setSwipeId(null)
      setSwipeX(0)
      if (navigator.vibrate) navigator.vibrate(15)
      suppressNextCloseClick.current = true
      setContextMenuId(msg.id)
    }, 450)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!touchStart.current) return
    const t = e.touches[0]
    const dx = t.clientX - touchStart.current.x
    const dy = t.clientY - touchStart.current.y

    if (swipeLocked.current === null) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        swipeLocked.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
        // Any real movement means this isn't a long-press
        if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
      }
    }
    if (swipeLocked.current !== 'h') return

    e.preventDefault()
    // Only reveal rightward (WhatsApp-style) - reads naturally for both
    // sides since .msgGroupMe is row-reversed but translateX is absolute.
    const clamped = Math.max(0, Math.min(SWIPE_MAX, dx))
    setSwipeX(clamped)
  }

  function onTouchEnd() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null }
    if (longPressFired.current) return // context menu already opened this gesture
    if (!touchStart.current) return
    const msg = messages.find(m => m.id === touchStart.current!.id)
    if (msg && swipeX >= SWIPE_TRIGGER) {
      setReplyTo(msg)
      setEditingId(null)
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

  function formatDuration(totalSeconds: number) {
    const s = Math.max(0, Math.round(totalSeconds))
    const mins = Math.floor(s / 60)
    const secs = s % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // ── Voice notes: record -> preview -> send ──────────────────────────
  async function startRecording() {
    setVoiceError('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setVoiceError('Voice notes are not supported in this browser.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recordStreamRef.current = stream

      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : ''
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        recordStreamRef.current?.getTracks().forEach(t => t.stop())
        recordStreamRef.current = null
        if (audioChunksRef.current.length === 0) return // cancelled - nothing to preview
        setVoiceBlob(blob)
        setVoicePreviewUrl(URL.createObjectURL(blob))
      }

      recorder.start()
      setIsRecording(true)
      setRecordSeconds(0)
      recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000)
    } catch {
      setVoiceError('Microphone access is blocked. Enable it in your browser settings to send voice notes.')
    }
  }

  // Stop and move to the listen-before-send preview.
  function stopRecording() {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    setIsRecording(false)
    mediaRecorderRef.current?.stop()
  }

  // Abandon mid-recording - no preview, nothing sent.
  function cancelRecording() {
    if (recordTimerRef.current) { clearInterval(recordTimerRef.current); recordTimerRef.current = null }
    setIsRecording(false)
    audioChunksRef.current = []
    if (mediaRecorderRef.current?.state !== 'inactive') mediaRecorderRef.current?.stop()
    recordStreamRef.current?.getTracks().forEach(t => t.stop())
    recordStreamRef.current = null
  }

  function discardVoicePreview() {
    if (voicePreviewUrl) URL.revokeObjectURL(voicePreviewUrl)
    setVoiceBlob(null)
    setVoicePreviewUrl(null)
    setRecordSeconds(0)
  }

  function confirmSendVoice() {
    if (!voiceBlob) return
    const blob = voiceBlob
    const durationSeconds = recordSeconds
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const localUrl = voicePreviewUrl ?? undefined

    const temp: Message = {
      id: tempId, content: '', sender_id: userId, sent_at: new Date().toISOString(),
      is_deleted: false, is_edited: false,
      file_url: localUrl, file_type: 'voice', duration_seconds: durationSeconds,
      _status: 'uploading', _progress: 5,
    }
    setMessages(prev => [...prev, temp])
    enqueue({ kind: 'voice', tempId, blob, durationSeconds })

    setVoiceBlob(null)
    setVoicePreviewUrl(null)
    setRecordSeconds(0)
  }

  // ── Stickers: tap to send immediately, like WhatsApp ────────────────
  function sendSticker(url: string) {
    setShowStickers(false)
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const temp: Message = {
      id: tempId, content: '', sender_id: userId, sent_at: new Date().toISOString(),
      is_deleted: false, is_edited: false,
      file_url: url, file_type: 'sticker',
      _status: 'sending',
    }
    setMessages(prev => [...prev, temp])
    enqueue({ kind: 'sticker', tempId, url })
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
  const canPost = !roomInfo?.is_group || roomInfo.posting_mode === 'everyone' || isModerator

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
            {roomInfo?.room_type === 'school_group' && school?.logo_url
              ? <img src={school.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
              : otherUser?.avatar_url
              ? <img src={otherUser.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
              : <span style={{ color:'#fff', fontWeight:700, fontSize:'1rem' }}>
                  {displayName[0]?.toUpperCase() ?? '#'}
                </span>
            }
          </div>
          <div style={{ minWidth:0, flex:1 }}>
            <p className={styles.roomName}>{displayName}</p>
            <p className={styles.roomMeta} style={{ color: (!roomInfo?.is_group && isOnline) ? '#22c55e' : undefined }}>
              {roomInfo?.is_group
                ? `${groupTypeLabel()} · ${memberCount} member${memberCount === 1 ? '' : 's'}`
                : (isOnline ? '● Online' : (otherUser?.role ?? ''))
              }
            </p>
          </div>
        </div>
        <button className={styles.moreBtn}
          onClick={e => { e.stopPropagation(); setShowMenu(!showMenu) }}>
          <MoreIcon size={20} />
        </button>
        {showMenu && (
          <div className={styles.headerMenu} onClick={e => e.stopPropagation()}>
            <button className="pressable" onClick={() => { setShowProfile(true); setShowMenu(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {roomInfo?.is_group ? <PeopleIcon size={15} /> : <UserIcon size={15} />}
              {roomInfo?.is_group ? 'Group info' : 'View profile'}
            </button>
            <button className="pressable" onClick={() => { loadMessages(); setShowMenu(false) }}
              style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <RefreshIcon size={15} /> Refresh chat
            </button>
          </div>
        )}
      </header>

      {/* ── PROFILE / GROUP INFO CARD ──────────────────── */}
      {showProfile && (
        <div className={styles.profileOverlay} onClick={closeProfileCard}>
          <div className={styles.profileCard} onClick={e => e.stopPropagation()}>
            <div className={styles.profileAvatar} style={{ background: schoolColor }}>
              {roomInfo?.room_type === 'school_group' && school?.logo_url
                ? <img src={school.logo_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                : roomInfo?.room_type === 'peer_group'
                ? <PeopleIcon size={28} color="#fff" />
                : otherUser?.avatar_url
                ? <img src={otherUser.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                : <span style={{ color:'#fff', fontWeight:700, fontSize:'1.6rem' }}>{displayName[0]?.toUpperCase() ?? '#'}</span>
              }
            </div>
            <p className={styles.profileName}>{displayName}</p>

            {roomInfo?.is_group && roomInfo.room_type === 'peer_group' ? (
              <>
                {groupNameEdit ? (
                  <div className={styles.groupNameEditRow}>
                    <input
                      className={styles.groupNameInput}
                      value={groupNameInput}
                      onChange={e => setGroupNameInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && saveGroupName()}
                      autoFocus
                    />
                    <button className={styles.inlineEditBtn} onClick={saveGroupName} disabled={groupActionBusy || !groupNameInput.trim()}>
                      <CheckIcon size={14} />
                    </button>
                    <button className={styles.inlineEditBtn} onClick={() => setGroupNameEdit(false)}>
                      <XIcon size={14} />
                    </button>
                  </div>
                ) : (
                  <p className={styles.profileMeta} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                    Group · {memberCount} member{memberCount === 1 ? '' : 's'}
                    {isGroupAdmin && (
                      <button
                        className={styles.inlineEditBtn}
                        onClick={() => { setGroupNameInput(roomInfo.name ?? ''); setGroupNameEdit(true) }}
                        title="Rename group"
                      >
                        <EditIcon size={12} />
                      </button>
                    )}
                  </p>
                )}

                {groupActionError && <p className={styles.findError} style={{ marginTop: 8 }}>{groupActionError}</p>}

                <div className={styles.memberList}>
                  {groupMembers.map(m => (
                    <div key={m.id} className={styles.memberRow}>
                      <div className={styles.memberAvatar} style={{ background: ROLE_COLORS[m.role] ?? schoolColor }}>
                        {m.avatar_url
                          ? <img src={m.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                          : <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.7rem' }}>{m.full_name?.[0]}</span>
                        }
                      </div>
                      <p className={styles.memberName}>{m.full_name}{m.id === userId ? ' (You)' : ''}</p>
                      {m.groupRole === 'admin' && <CrownIcon size={13} color="#f59e0b" />}
                      {isGroupAdmin && m.groupRole !== 'admin' && m.id !== userId && (
                        <button className={styles.removeMemberBtn} title="Remove" onClick={() => removeMemberFromGroup(m.id)} disabled={groupActionBusy}>
                          <XIcon size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {isGroupAdmin && (
                  showAddMember ? (
                    <div className={styles.addMemberPanel}>
                      <input
                        className={styles.groupNameInput}
                        value={memberSearch}
                        onChange={e => setMemberSearch(e.target.value)}
                        placeholder="Search by name or code"
                        autoFocus
                      />
                      {memberSearch.trim().length >= 2 && (memberSearching || memberResults.length > 0) && (
                        <div className={styles.suggestList}>
                          {memberResults.map(u => (
                            <button key={u.id} className={styles.suggestItem} onClick={() => addMemberToGroup(u.id)} disabled={groupActionBusy}>
                              <div className={styles.suggestAvatar} style={{ background: ROLE_COLORS[u.role] ?? schoolColor }}>
                                <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.75rem' }}>{u.full_name?.[0]}</span>
                              </div>
                              <div className={styles.suggestInfo}>
                                <p className={styles.suggestName}>{u.full_name}</p>
                                <p className={styles.suggestMeta}>{u.role} · {u.default_code}</p>
                              </div>
                              <PlusIcon size={13} color="var(--text-muted)" />
                            </button>
                          ))}
                        </div>
                      )}
                      <button className={styles.profileClose} onClick={() => { setShowAddMember(false); setMemberSearch('') }}>Done</button>
                    </div>
                  ) : (
                    <button className={styles.addMemberBtn} onClick={() => setShowAddMember(true)}>
                      <PlusIcon size={13} /> Add members
                    </button>
                  )
                )}

                <button className={styles.leaveGroupBtn} onClick={leaveGroup} disabled={groupActionBusy}>
                  Leave group
                </button>
              </>
            ) : roomInfo?.is_group ? (
              <>
                <p className={styles.profileMeta}>
                  {groupTypeLabel()} · {memberCount} member{memberCount === 1 ? '' : 's'}
                </p>
                {isModerator ? (
                  <div className={styles.postingModeRow}>
                    <span>Who can post</span>
                    <div className={styles.postingModeToggle}>
                      <button
                        className={roomInfo.posting_mode !== 'everyone' ? styles.postingModeActive : ''}
                        disabled={savingMode}
                        onClick={() => updatePostingMode('moderators_only')}
                      >
                        {roomInfo.room_type === 'school_group' ? 'Staff only' : 'Teacher only'}
                      </button>
                      <button
                        className={roomInfo.posting_mode === 'everyone' ? styles.postingModeActive : ''}
                        disabled={savingMode}
                        onClick={() => updatePostingMode('everyone')}
                      >
                        Everyone
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className={styles.profileBadge}>
                    {roomInfo.posting_mode === 'everyone' ? 'Everyone can post' : 'Only moderators can post here'}
                  </p>
                )}
              </>
            ) : (
              <>
                <p className={styles.profileMeta}>{otherUser?.role}{otherUser?.default_code ? ` · ${otherUser.default_code}` : ''}</p>
                {otherUser?.school_id !== school?.id && otherUser?.school_id && (
                  <p className={styles.profileBadge}>From a different school</p>
                )}
              </>
            )}

            <button className={styles.profileClose} onClick={closeProfileCard}>Close</button>
          </div>
        </div>
      )}

      {/* ── MESSAGES ───────────────────────────────────── */}
      <div className={styles.messages}>
        {loading && (
          <div className={styles.loadingRow}>
            <div className={styles.dots}><span/><span/><span/></div>
          </div>
        )}

        {!loading && messages.length === 0 && (
          <div className={styles.emptyMessages} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <MessageIcon size={32} color="var(--text-faint)" strokeWidth={1.5} />
            <p>No messages yet. Say hello!</p>
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
                  {/* Centered swipe-to-reply cue - fades/scales in past the trigger distance */}
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

                    {/* Reply preview - same hue as the bubble below it (darkened a touch)
                        so this reads as the top strip of ONE message, not a second bubble */}
                    {msg.reply_to && (
                      <div
                        className={`${styles.replyPreview} ${isMe ? styles.replyPreviewMe : ''}`}
                        style={isMe ? { background: schoolColor, filter: 'brightness(0.82)' } : undefined}
                      >
                        <div className={styles.replyBar} style={{ background: isMe ? 'rgba(255,255,255,0.6)' : schoolColor }} />
                        <div className={styles.replyContent}>
                          <p className={styles.replyAuthor} style={isMe ? { color: 'rgba(255,255,255,0.85)' } : undefined}>{msg.reply_to.sender_name}</p>
                          <p className={styles.replyText} style={isMe ? { color: 'rgba(255,255,255,0.75)' } : undefined}>{msg.reply_to.content}</p>
                        </div>
                      </div>
                    )}

                    <div
                      className={`${styles.bubble} ${isMe ? styles.bubbleMe : styles.bubbleThem} ${msg._status === 'failed' ? styles.bubbleFailed : ''} ${msg.file_type === 'sticker' ? styles.bubbleSticker : ''}`}
                      style={isMe && msg.file_type !== 'sticker' ? { background: schoolColor } : undefined}
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
                      {msg.file_type === 'voice' && msg.file_url && (
                        <div className={styles.mediaWrap}>
                          <audio src={msg.file_url} controls className={styles.audio} />
                          {msg._status === 'uploading' && (
                            <div className={styles.mediaOverlay}>
                              <div className={styles.spinner} />
                              <span>{Math.round(msg._progress ?? 0)}%</span>
                            </div>
                          )}
                        </div>
                      )}
                      {msg.file_type === 'sticker' && msg.file_url && (
                        <img src={msg.file_url} alt="Sticker" className={styles.stickerMsg} />
                      )}
                      {(msg.file_type === 'image' || msg.file_type === 'video') && msg.content?.trim() && (
                        <p className={styles.captionText}>{msg.content}</p>
                      )}
                      {msg.file_type === 'file' && msg.file_url && (
                        <a href={msg.file_url} target="_blank" rel="noreferrer" className={styles.fileLink}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <PaperclipIcon size={14} /> {msg.content}
                        </a>
                      )}
                      {!msg.file_type && (
                        msg.is_deleted
                          ? <p className={styles.deleted}>Message deleted</p>
                          : <p className={styles.bubbleText}>{msg.content}</p>
                      )}
                      <div className={styles.msgFooter}>
                        {msg.is_edited && !msg.is_deleted && <span className={styles.edited}>edited</span>}
                        <span className={styles.msgTime}>{formatTime(msg.sent_at)}</span>
                        {isMe && msg._status === 'sending' && <span className={styles.msgClock}><ClockIcon size={11} /></span>}
                        {isMe && msg._status === 'uploading' && <span className={styles.msgClock}><UploadIcon size={11} /></span>}
                        {isMe && (msg._status === 'sent' || !msg._status) && (
                          <span className={`${styles.msgCheck} ${readIds.has(msg.id) ? styles.msgCheckSeen : ''}`}
                            style={{ display: 'inline-flex', alignItems: 'center' }}>
                            <CheckIcon size={11} /><span style={{ marginLeft: -6 }}><CheckIcon size={11} /></span>
                          </span>
                        )}
                        {isMe && msg._status === 'failed' && (
                          <button className={styles.retryBtn} onClick={e => { e.stopPropagation(); retry(msg) }}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <AlertIcon size={11} /> retry
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

                    {/* Action buttons - hover-reveal on desktop; hidden on mobile
                        in favor of the long-press context menu below */}
                    <div className={`${styles.msgActions} ${isMe ? styles.msgActionsMe : ''}`}>
                      {canPost && (
                        <button className={styles.actionBtn} title="Reply"
                          onClick={e => { e.stopPropagation(); setReplyTo(msg); setEditingId(null); setTimeout(() => inputRef.current?.focus(), 50) }}>
                          ↩
                        </button>
                      )}
                      <button className={styles.actionBtn} title="React"
                        onClick={e => { e.stopPropagation(); setEmojiTarget(emojiTarget === msg.id ? null : msg.id) }}>
                        <SmileIcon size={13} />
                      </button>
                      {isMe && !msg.is_deleted && !msg.file_type && (
                        <button className={styles.actionBtn} title="Edit"
                          onClick={e => { e.stopPropagation(); startEdit(msg) }}>
                          <EditIcon size={13} />
                        </button>
                      )}
                      {isMe && !msg.is_deleted && (
                        <button className={styles.actionBtn} title="Delete"
                          onClick={e => { e.stopPropagation(); deleteMessage(msg.id) }}>
                          <TrashIcon size={13} />
                        </button>
                      )}
                    </div>

                    {/* Long-press context menu (mobile) - same actions as above */}
                    {contextMenuId === msg.id && (
                      <div className={styles.contextMenuOverlay}
                        onClick={() => {
                          if (suppressNextCloseClick.current) { suppressNextCloseClick.current = false; return }
                          setContextMenuId(null)
                        }}>
                        <div className={styles.contextMenu} onClick={e => e.stopPropagation()}>
                          {canPost && (
                            <button className="pressable" onClick={() => { setReplyTo(msg); setEditingId(null); setContextMenuId(null); setTimeout(() => inputRef.current?.focus(), 80) }}>
                              ↩ Reply
                            </button>
                          )}
                          <button className="pressable" onClick={() => { setEmojiTarget(msg.id); setContextMenuId(null) }}
                            style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <SmileIcon size={14} /> React
                          </button>
                          {isMe && !msg.is_deleted && !msg.file_type && (
                            <button className="pressable" onClick={() => startEdit(msg)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <EditIcon size={14} /> Edit
                            </button>
                          )}
                          {isMe && !msg.is_deleted && (
                            <button className={styles.contextMenuDanger} onClick={() => deleteMessage(msg.id)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <TrashIcon size={14} /> Delete
                            </button>
                          )}
                          <button className={styles.contextMenuCancel} onClick={() => setContextMenuId(null)}>Cancel</button>
                        </div>
                      </div>
                    )}

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
      {replyTo && !editingId && (
        <div className={styles.replyBanner}>
          <div className={styles.replyBannerBar} style={{ background: schoolColor }} />
          <div className={styles.replyBannerContent}>
            <p className={styles.replyBannerAuthor} style={{ color: schoolColor }}>
              Replying to {replyTo.sender?.full_name ?? 'message'}
            </p>
            <p className={styles.replyBannerText}>
              {replyTo.is_deleted ? 'Deleted message' : displayLabel(replyTo)}
            </p>
          </div>
          <button className={styles.replyBannerClose} onClick={() => setReplyTo(null)}>
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* ── EDITING BANNER ─────────────────────────────── */}
      {editingId && (
        <div className={styles.replyBanner}>
          <div className={styles.replyBannerBar} style={{ background: '#f59e0b' }} />
          <div className={styles.replyBannerContent}>
            <p className={styles.replyBannerAuthor} style={{ color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 6 }}>
              <EditIcon size={13} /> Editing message
            </p>
          </div>
          <button className={styles.replyBannerClose} onClick={cancelEdit}>
            <XIcon size={16} />
          </button>
        </div>
      )}

      {/* ── ATTACHMENT PREVIEW - add a caption before it actually sends ── */}
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
              <div className={styles.attachPreviewFile} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PaperclipIcon size={14} /> {pendingFile.name}
              </div>
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

      {/* ── STICKER PICKER ──────────────────────────────────────────── */}
      {showStickers && (
        <div className={styles.stickerPicker} onClick={e => e.stopPropagation()}>
          <div className={styles.stickerPickerHeader}>
            <span>Stickers</span>
            <button onClick={() => setShowStickers(false)}><XIcon size={14} /></button>
          </div>
          <div className={styles.stickerGrid}>
            {STICKERS.map(s => (
              <button key={s.id} className={styles.stickerItem} onClick={() => sendSticker(s.src)} title={s.alt}>
                <img src={s.src} alt={s.alt} />
              </button>
            ))}
          </div>
        </div>
      )}

      {voiceError && (
        <div className={styles.voiceError}>
          <AlertIcon size={13} /> {voiceError}
        </div>
      )}

      {/* ── INPUT BAR - nudged above the keyboard via --kb-offset ── */}
      {canPost ? (
        isRecording ? (
          <div className={styles.recordingBar}>
            <span className={styles.recDot} />
            <span className={styles.recTimer}>{formatDuration(recordSeconds)}</span>
            <span className={styles.recWave}>
              {Array.from({ length: 5 }).map((_, i) => <span key={i} className={styles.recWaveBar} />)}
            </span>
            <button className={styles.recCancelBtn} onClick={cancelRecording}>Cancel</button>
            <button className={styles.recSendBtn} style={{ background: schoolColor }} onClick={stopRecording} title="Stop and review">
              <StopIcon size={14} color="white" />
            </button>
          </div>
        ) : voicePreviewUrl ? (
          <div className={styles.previewBar}>
            <audio src={voicePreviewUrl} controls className={styles.previewAudio} />
            <span className={styles.recTimer}>{formatDuration(recordSeconds)}</span>
            <button className={styles.discardBtn} onClick={discardVoicePreview} title="Discard">
              <TrashIcon size={15} />
            </button>
            <button className={styles.sendVoiceBtn} style={{ background: schoolColor }} onClick={confirmSendVoice} title="Send">
              <SendIcon size={15} color="white" />
            </button>
          </div>
        ) : (
          <div className={styles.inputBar}>
            <input ref={fileRef} type="file" className={styles.fileInput} onChange={pickFile}
              accept="image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" />
            <button className={styles.attachBtn} onClick={() => fileRef.current?.click()} title="Attach">
              <PaperclipIcon size={18} color="var(--text-muted)" />
            </button>
            <button
              className={styles.attachBtn}
              onClick={e => { e.stopPropagation(); setShowStickers(p => !p) }}
              title="Stickers"
            >
              <StickerIcon size={18} color={showStickers ? schoolColor : 'var(--text-muted)'} />
            </button>
            <input
              ref={inputRef}
              className={styles.textInput}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKey}
              placeholder={editingId ? 'Edit message...' : replyTo ? `Replying to ${replyTo.sender?.full_name ?? 'message'}...` : 'Message...'}
            />
            {text.trim() ? (
              <button
                className={styles.sendBtn}
                style={{ background: schoolColor }}
                onClick={sendText}
              >
                <SendIcon size={16} color="white" />
              </button>
            ) : (
              <button className={styles.micBtn} onClick={startRecording} title="Record a voice note">
                <MicIcon size={17} color="var(--text-muted)" />
              </button>
            )}
          </div>
        )
      ) : (
        <div className={styles.readOnlyBar} style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <LockIcon size={13} /> Only {roomInfo?.room_type === 'school_group' ? 'staff' : 'the teacher'} can post here, you can still react and comment with emoji
        </div>
      )}
    </div>
  )
}
