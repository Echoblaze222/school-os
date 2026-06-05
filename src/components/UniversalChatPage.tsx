'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import {
  MessageIcon, SearchIcon, PlusIcon,
  UserIcon, PeopleIcon, XIcon,
} from '@/components/Icons'
import styles from './chat.module.css'

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  profile:      any
  school:       any
  userId:       string
  role:         string
  schoolColor?: string
}

interface Room {
  id:            string
  name:          string
  room_type:     string
  updated_at:    string
  last_message?: string
  last_sent_at?: string
  unread?:       number
  other_user?:   { full_name: string; role: string; default_code: string; avatar_url?: string }
}

// Maps role pairs to valid chat_room_type enum values
function getRoomType(roleA: string, roleB: string): string {
  const map: Record<string, string> = {
    'principal_principal': 'principal_to_principal',
    'teacher_teacher':     'teacher_to_teacher',
    'student_student':     'student_to_student',
    'student_teacher':     'student_to_teacher',
    'teacher_student':     'student_to_teacher',
    'principal_teacher':   'teacher_to_teacher',
    'teacher_principal':   'teacher_to_teacher',
    'principal_student':   'student_to_teacher',
    'student_principal':   'student_to_teacher',
    'bursar_teacher':      'teacher_to_teacher',
    'bursar_principal':    'principal_to_principal',
    'bursar_student':      'student_to_teacher',
    'secretary_teacher':   'teacher_to_teacher',
    'secretary_principal': 'principal_to_principal',
    'secretary_student':   'student_to_teacher',
    'parent_teacher':      'student_to_teacher',
    'parent_principal':    'principal_to_principal',
  }
  const key = `${roleA}_${roleB}`
  return map[key] ?? 'student_to_teacher'
}

const ROLE_COLORS: Record<string, string> = {
  student:   '#3B82F6',
  teacher:   '#10B981',
  principal: '#8B5CF6',
  bursar:    '#F59E0B',
  secretary: '#EC4899',
  parent:    '#F97316',
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UniversalChatPage({
  profile, school, userId, role, schoolColor = '#7C3AED',
}: Props) {
  const [rooms,        setRooms]        = useState<Room[]>([])
  const [loading,      setLoading]      = useState(true)
  const [showFind,     setShowFind]     = useState(false)
  const [code,         setCode]         = useState('')
  const [finding,      setFinding]      = useState(false)
  const [foundUser,    setFoundUser]    = useState<any>(null)
  const [findError,    setFindError]    = useState('')
  const [searchQuery,  setSearchQuery]  = useState('')
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null)

  const supabase = createClient()
  const router   = useRouter()
  const codeRef  = useRef<HTMLInputElement>(null)

  useEffect(() => { loadRooms() }, [])

  // Real-time: update room list when new messages arrive
  useEffect(() => {
    const ch = supabase
      .channel(`user-rooms:${userId}`)
      .on('postgres_changes', {
        event:  'INSERT',
        schema: 'public',
        table:  'chat_messages',
      }, () => {
        loadRooms()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId])

  // ── Load rooms ────────────────────────────────────────────────────────────────

  async function loadRooms() {
    const { data } = await supabase
      .from('chat_room_members')
      .select(`
        room_id,
        room:chat_rooms(
          id, name, room_type, is_group, updated_at,
          members:chat_room_members(
            user:profiles(id, full_name, role, default_code, avatar_url)
          ),
          messages:chat_messages(content, sent_at, sender_id)
        )
      `)
      .eq('user_id', userId)

    if (data) {
      const processed = data.map((d: any) => {
        const room = d.room
        if (!room) return null

        const other = !room.is_group
          ? room.members?.find((m: any) => m.user?.id !== userId)?.user
          : null

        // Sort messages ascending to get the last one
        const msgs = (room.messages ?? []).sort(
          (a: any, b: any) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        )
        const lastMsg = msgs[msgs.length - 1]

        return {
          id:           room.id,
          name:         other?.full_name ?? room.name ?? 'Chat',
          room_type:    room.room_type,
          updated_at:   lastMsg?.sent_at ?? room.updated_at,
          last_message: lastMsg?.content ?? null,
          last_sent_at: lastMsg?.sent_at ?? null,
          other_user:   other ?? null,
        }
      }).filter(Boolean) as Room[]

      processed.sort(
        (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
      )
      setRooms(processed)
    }
    setLoading(false)
  }

  // ── Find user by ID code ──────────────────────────────────────────────────────

  async function findUserByCode() {
    if (!code.trim()) return
    setFinding(true)
    setFindError('')
    setFoundUser(null)

    const cleaned = code.trim().toUpperCase()

    // Exact match first
    const { data: exactData, error: exactError } = await supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, school_id')
      .eq('default_code', cleaned)
      .maybeSingle()

    if (exactData) {
      if (exactData.id === userId) {
        setFindError("That's your own code! Enter someone else's.")
        setFinding(false)
        return
      }
      setFoundUser(exactData)
      setFinding(false)
      return
    }

    // Fuzzy fallback
    const stripped = cleaned.replace(/-/g, '')
    const { data: fuzzyData } = await supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, school_id')
      .ilike('default_code', `%${stripped.slice(-6)}%`)
      .limit(1)
      .maybeSingle()

    if (fuzzyData && fuzzyData.id !== userId) {
      setFoundUser(fuzzyData)
      setFinding(false)
      return
    }

    setFindError(
      exactError?.message
        ? `Error: ${exactError.message}`
        : 'No user found with that code. Check and try again.'
    )
    setFinding(false)
  }

  // ── Start or open DM ─────────────────────────────────────────────────────────

  async function startDM() {
    if (!foundUser) return
    setFinding(true)

    // Check if room already exists
    const { data: myRooms } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', userId)

    if (myRooms && myRooms.length > 0) {
      const myRoomIds = myRooms.map((r: any) => r.room_id)
      const { data: shared } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', foundUser.id)
        .in('room_id', myRoomIds)

      if (shared && shared.length > 0) {
        const { data: roomCheck } = await supabase
          .from('chat_rooms')
          .select('id')
          .eq('id', shared[0].room_id)
          .eq('is_group', false)
          .maybeSingle()

        if (roomCheck) {
          router.push(`/dashboard/${role}/chat/${roomCheck.id}`)
          setFinding(false)
          return
        }
      }
    }

    // Create new DM room
    const isCrossSchool = foundUser.school_id !== profile?.school_id
    const roomName  = [profile?.full_name, foundUser.full_name].sort().join(' & ')
    const roomType  = getRoomType(role, foundUser.role)

    const { data: room, error: roomError } = await supabase
      .from('chat_rooms')
      .insert({
        name:       roomName,
        room_type:  roomType,
        is_group:   false,
        created_by: userId,
        school_id:  isCrossSchool ? null : profile?.school_id,
      })
      .select('id')
      .single()

    if (roomError || !room) {
      setFindError(`Could not create chat: ${roomError?.message ?? 'Unknown error'}`)
      setFinding(false)
      return
    }

    await supabase.from('chat_room_members').insert([
      { room_id: room.id, user_id: userId },
      { room_id: room.id, user_id: foundUser.id },
    ])

    router.push(`/dashboard/${role}/chat/${room.id}`)
    setFinding(false)
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function timeAgo(d: string) {
    if (!d) return ''
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)    return 'now'
    if (mins < 60)   return `${mins}m`
    if (mins < 1440) return `${Math.floor(mins / 60)}h`
    if (mins < 10080) return `${Math.floor(mins / 1440)}d`
    return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  }

  function previewText(msg: string | undefined | null) {
    if (!msg) return ''
    if (msg.length > 50) return msg.slice(0, 50) + '…'
    return msg
  }

  const filteredRooms = rooms.filter(r =>
    !searchQuery ||
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.other_user?.default_code?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className={styles.page}>
      <DashboardHeader
        userId={userId} role={role} profile={profile}
        school={school} schoolColor={schoolColor} title="Messages"
      />

      <div className={styles.chatLayout}>

        {/* ── SIDEBAR ───────────────────────────────────────── */}
        <div className={styles.sidebar}>

          {/* Sidebar top bar */}
          <div className={styles.sidebarTop}>
            <p className={styles.sidebarTitle}>Chats</p>
            <button
              className={styles.newChatBtn}
              style={{ background: schoolColor }}
              onClick={() => {
                setShowFind(!showFind)
                setFoundUser(null)
                setCode('')
                setFindError('')
                setTimeout(() => codeRef.current?.focus(), 100)
              }}
              title={showFind ? 'Close' : 'New chat'}
            >
              {showFind
                ? <XIcon size={15} color="white" />
                : <PlusIcon size={15} color="white" />
              }
            </button>
          </div>

          {/* Search bar */}
          {!showFind && rooms.length > 0 && (
            <div className={styles.searchBar}>
              <SearchIcon size={14} color="var(--text-muted)" />
              <input
                className={styles.searchInput}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search chats..."
              />
              {searchQuery && (
                <button className={styles.searchClear} onClick={() => setSearchQuery('')}>
                  <XIcon size={13} color="var(--text-muted)" />
                </button>
              )}
            </div>
          )}

          {/* Find user panel */}
          {showFind && (
            <div className={styles.findPanel}>
              <p className={styles.findTitle}>New Message</p>
              <p className={styles.findDesc}>Enter a user's ID code to start a chat</p>
              <div className={styles.findRow}>
                <input
                  ref={codeRef}
                  className={styles.findInput}
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && findUserByCode()}
                  placeholder="e.g. SCH-2024-001"
                  autoFocus
                />
                <button
                  className={styles.findBtn}
                  style={{ background: schoolColor }}
                  onClick={findUserByCode}
                  disabled={finding || !code.trim()}
                >
                  {finding ? '…' : <SearchIcon size={15} color="white" />}
                </button>
              </div>

              {findError && <p className={styles.findError}>{findError}</p>}

              {foundUser && (
                <div className={styles.foundUser}>
                  <div
                    className={styles.foundAvatar}
                    style={{ background: ROLE_COLORS[foundUser.role] ?? schoolColor }}
                  >
                    {foundUser.avatar_url
                      ? <img src={foundUser.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : <UserIcon size={16} color="white" />
                    }
                  </div>
                  <div className={styles.foundInfo}>
                    <p className={styles.foundName}>{foundUser.full_name}</p>
                    <p className={styles.foundMeta}>{foundUser.role} · {foundUser.default_code}</p>
                  </div>
                  <button
                    className={styles.dmBtn}
                    style={{ background: schoolColor }}
                    onClick={startDM}
                    disabled={finding}
                  >
                    {finding ? '…' : 'Chat →'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Room list */}
          <div className={styles.roomList}>
            {loading ? (
              <div className={styles.listLoading}><span /><span /><span /></div>
            ) : filteredRooms.length === 0 ? (
              <div className={styles.emptyList}>
                <MessageIcon size={28} color="var(--text-faint)" strokeWidth={1} />
                {searchQuery
                  ? <p>No chats matching "{searchQuery}"</p>
                  : <>
                      <p>No chats yet</p>
                      <p style={{ fontSize: '0.72rem', color: 'var(--text-faint)' }}>
                        Use the + button to start a chat with any user's ID code
                      </p>
                    </>
                }
              </div>
            ) : (
              filteredRooms.map(room => (
                <Link
                  key={room.id}
                  href={`/dashboard/${role}/chat/${room.id}`}
                  className={`${styles.roomItem} ${activeRoomId === room.id ? styles.roomItemActive : ''}`}
                  onClick={() => setActiveRoomId(room.id)}
                  style={activeRoomId === room.id ? { borderLeft: `3px solid ${schoolColor}` } : undefined}
                >
                  <div
                    className={styles.roomAvatar}
                    style={{
                      background: room.other_user
                        ? (ROLE_COLORS[room.other_user.role] ?? schoolColor)
                        : schoolColor,
                    }}
                  >
                    {room.other_user?.avatar_url
                      ? <img src={room.other_user.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      : room.room_type === 'group' || !room.other_user
                        ? <PeopleIcon size={15} color="white" />
                        : <span style={{ color: '#fff', fontWeight: 700, fontSize: '0.9rem' }}>
                            {room.name[0]?.toUpperCase()}
                          </span>
                    }
                  </div>
                  <div className={styles.roomInfo}>
                    <div className={styles.roomTopRow}>
                      <p className={styles.roomName}>{room.name}</p>
                      {room.last_sent_at && (
                        <span className={styles.roomTime}>{timeAgo(room.last_sent_at)}</span>
                      )}
                    </div>
                    {room.last_message && (
                      <p className={styles.roomPreview}>{previewText(room.last_message)}</p>
                    )}
                    {room.other_user && !room.last_message && (
                      <p className={styles.roomCode}>{room.other_user.default_code}</p>
                    )}
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* ── EMPTY STATE (desktop right pane) ──────────────── */}
        <div className={styles.emptyChat}>
          <div className={styles.emptyChatIcon} style={{ background: `${schoolColor}15` }}>
            <MessageIcon size={36} color={schoolColor} strokeWidth={1.5} />
          </div>
          <h3>Select a conversation</h3>
          <p>Choose a chat from the list, or start a new one by clicking + and entering a user's ID code.</p>
        </div>

      </div>
    </div>
  )
}
