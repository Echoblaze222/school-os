'use client'
import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import {
  MessageIcon, SearchIcon, PlusIcon,
  UserIcon, PeopleIcon, ArrowLeftIcon,
} from '@/components/Icons'
import styles from './chat.module.css'

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
  unread?:       number
  other_user?:   { full_name: string; role: string; default_code: string; avatar_url?: string }
}

export default function UniversalChatPage({ profile, school, userId, role, schoolColor = '#7C3AED' }: Props) {
  const [rooms,     setRooms]     = useState<Room[]>([])
  const [loading,   setLoading]   = useState(true)
  const [showFind,  setShowFind]  = useState(false)
  const [code,      setCode]      = useState('')
  const [finding,   setFinding]   = useState(false)
  const [foundUser, setFoundUser] = useState<any>(null)
  const [findError, setFindError] = useState('')
  const supabase = createClient()
  const router   = useRouter()

  useEffect(() => { loadRooms() }, [])

  async function loadRooms() {
    const { data, error } = await supabase
      .from('chat_room_members')
      .select(`
        room_id,
        room:chat_rooms(
          id, name, room_type, updated_at,
          members:chat_room_members(
            user:profiles(id, full_name, role, default_code, avatar_url)
          ),
          messages:chat_messages(content, sent_at)
        )
      `)
      .eq('user_id', userId)

    if (data) {
      const processed = data.map((d: any) => {
        const room = d.room
        if (!room) return null

        // For direct rooms, find the other person
        const other = room.room_type !== 'group'
          ? room.members?.find((m: any) => m.user?.id !== userId)?.user
          : null

        // Get last message — sort by sent_at
        const msgs = (room.messages ?? []).sort(
          (a: any, b: any) => new Date(a.sent_at).getTime() - new Date(b.sent_at).getTime()
        )
        const lastMsg = msgs[msgs.length - 1]

        return {
          id:           room.id,
          name:         other?.full_name ?? room.name ?? 'Group Chat',
          room_type:    room.room_type,
          updated_at:   room.updated_at,
          last_message: lastMsg?.content ?? null,
          other_user:   other ?? null,
        }
      }).filter(Boolean) as Room[]

      // Sort by latest activity
      processed.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
      setRooms(processed)
    }
    setLoading(false)
  }

  // ── Find user by ID code ──────────────────────────────────
  async function findUserByCode() {
    if (!code.trim()) return
    setFinding(true); setFindError(''); setFoundUser(null)

    const cleaned = code.trim().toUpperCase()

    // Exact match — no school_id filter (supports cross-school search)
    let { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, class_level, school_id')
      .eq('default_code', cleaned)
      .single()

    // Fuzzy fallback — strip dashes, match last 6 chars
    if (!data) {
      const stripped = cleaned.replace(/-/g, '')
      const { data: fuzzy } = await supabase
        .from('profiles')
        .select('id, full_name, role, default_code, avatar_url, class_level, school_id')
        .ilike('default_code', `%${stripped.slice(-6)}%`)
        .limit(1)
        .single()
      data = fuzzy ?? null
    }

    if (!data) {
      setFindError('No user found with that code. Check and try again.')
      setFinding(false); return
    }
    if (data.id === userId) {
      setFindError("That's your own code! Enter someone else's.")
      setFinding(false); return
    }

    setFoundUser(data)
    setFinding(false)
  }

  // ── Start or open DM with found user ─────────────────────
  async function startDM() {
    if (!foundUser) return
    setFinding(true)

    // Check if a DM room already exists between these two users
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
        // Verify it's a direct (non-group) room
        const { data: roomCheck } = await supabase
          .from('chat_rooms')
          .select('id, room_type')
          .eq('id', shared[0].room_id)
          .eq('is_group', false)
          .single()

        if (roomCheck) {
          router.push(`/dashboard/${role}/chat/${roomCheck.id}`)
          setFinding(false)
          return
        }
      }
    }

    // Create new DM room
    const isCrossSchool = foundUser.school_id !== profile?.school_id
    const roomName = [profile?.full_name, foundUser.full_name].sort().join(' & ')

    const { data: room, error: roomError } = await supabase
      .from('chat_rooms')
      .insert({
        name:       roomName,
        room_type:  'direct_message',
        is_group:   false,
        created_by: userId,
        school_id:  isCrossSchool ? null : profile?.school_id,
      })
      .select('id')
      .single()

    if (roomError || !room) {
      setFindError('Failed to create chat room. Please try again.')
      setFinding(false); return
    }

    await supabase.from('chat_room_members').insert([
      { room_id: room.id, user_id: userId },
      { room_id: room.id, user_id: foundUser.id },
    ])

    router.push(`/dashboard/${role}/chat/${room.id}`)
    setFinding(false)
  }

  function timeAgo(d: string) {
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)    return 'now'
    if (mins < 60)   return `${mins}m`
    if (mins < 1440) return `${Math.floor(mins / 60)}h`
    return `${Math.floor(mins / 1440)}d`
  }

  const ROLE_COLORS: Record<string, string> = {
    student:   '#3B82F6',
    teacher:   '#10B981',
    principal: '#8B5CF6',
    bursar:    '#F59E0B',
    secretary: '#EC4899',
    parent:    '#F97316',
  }

  return (
    <div className={styles.page}>
      <DashboardHeader
        userId={userId} role={role} profile={profile}
        school={school} schoolColor={schoolColor} title="Messages"
      />

      <div className={styles.chatLayout}>

        {/* ── SIDEBAR ─────────────────────────────────────── */}
        <div className={styles.sidebar}>

          {/* New chat button */}
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
              }}
            >
              <PlusIcon size={15} color="white" />
            </button>
          </div>

          {/* Find user panel */}
          {showFind && (
            <div className={styles.findPanel}>
              <p className={styles.findTitle}>New Message</p>
              <p className={styles.findDesc}>Enter a user's ID code to start a chat</p>
              <div className={styles.findRow}>
                <input
                  className={styles.findInput}
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && findUserByCode()}
                  placeholder="Enter ID code (e.g. SCH-2024-001)"
                  autoFocus
                />
                <button
                  className={styles.findBtn}
                  style={{ background: schoolColor }}
                  onClick={findUserByCode}
                  disabled={finding || !code.trim()}
                >
                  {finding ? '...' : <SearchIcon size={15} color="white" />}
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
                    <p className={styles.foundMeta}>
                      {foundUser.role} · {foundUser.default_code}
                      {foundUser.class_level ? ` · ${foundUser.class_level}` : ''}
                    </p>
                  </div>
                  <button
                    className={styles.dmBtn}
                    style={{ background: schoolColor }}
                    onClick={startDM}
                    disabled={finding}
                  >
                    {finding ? '...' : 'Chat →'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Room list */}
          <div className={styles.roomList}>
            {loading
              ? (
                <div className={styles.listLoading}>
                  <span /><span /><span />
                </div>
              )
              : rooms.length === 0
                ? (
                  <div className={styles.emptyList}>
                    <MessageIcon size={28} color="var(--text-faint)" />
                    <p>No chats yet</p>
                    <p style={{ fontSize: '0.72rem' }}>
                      Use the + button to find someone by ID code
                    </p>
                  </div>
                )
                : rooms.map(room => (
                  <Link
                    key={room.id}
                    href={`/dashboard/${role}/chat/${room.id}`}
                    className={styles.roomItem}
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
                        : room.room_type === 'group'
                          ? <PeopleIcon size={15} color="white" />
                          : <UserIcon size={15} color="white" />
                      }
                    </div>
                    <div className={styles.roomInfo}>
                      <div className={styles.roomTopRow}>
                        <p className={styles.roomName}>{room.name}</p>
                        <span className={styles.roomTime}>{timeAgo(room.updated_at)}</span>
                      </div>
                      {room.last_message && (
                        <p className={styles.roomPreview}>{room.last_message}</p>
                      )}
                      {room.other_user && (
                        <p className={styles.roomCode}>{room.other_user.default_code}</p>
                      )}
                    </div>
                  </Link>
                ))
            }
          </div>
        </div>

        {/* ── EMPTY STATE (desktop right panel) ───────────── */}
        <div className={styles.emptyChat}>
          <MessageIcon size={48} color="var(--text-faint)" strokeWidth={1} />
          <h3>Select a chat</h3>
          <p>Choose a conversation from the sidebar or start a new one with an ID code.</p>
        </div>

      </div>
    </div>
  )
            }
      
