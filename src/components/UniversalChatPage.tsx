'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import {
  MessageIcon, SearchIcon, PlusIcon,
  UserIcon, XIcon,
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
  last_message?: string | null
  last_sent_at?: string | null
  other_user?:   { id: string; full_name: string; role: string; default_code: string; avatar_url?: string } | null
}

const ROLE_COLORS: Record<string, string> = {
  student:   '#3B82F6',
  teacher:   '#10B981',
  principal: '#8B5CF6',
  bursar:    '#F59E0B',
  secretary: '#EC4899',
  parent:    '#F97316',
}

function getRoomType(roleA: string, roleB: string): string {
  const pairs: Record<string, string> = {
    student_teacher:     'student_to_teacher',
    teacher_student:     'student_to_teacher',
    student_principal:   'student_to_teacher',
    principal_student:   'student_to_teacher',
    teacher_teacher:     'teacher_to_teacher',
    principal_teacher:   'teacher_to_teacher',
    teacher_principal:   'teacher_to_teacher',
    principal_principal: 'principal_to_principal',
    bursar_principal:    'principal_to_principal',
    bursar_teacher:      'teacher_to_teacher',
    bursar_student:      'student_to_teacher',
    secretary_principal: 'principal_to_principal',
    secretary_teacher:   'teacher_to_teacher',
    secretary_student:   'student_to_teacher',
    parent_teacher:      'student_to_teacher',
    parent_principal:    'principal_to_principal',
    student_student:     'student_to_student',
  }
  return pairs[`${roleA}_${roleB}`] ?? 'student_to_teacher'
}

export default function UniversalChatPage({
  profile, school, userId, role, schoolColor = '#7C3AED',
}: Props) {
  const [rooms,       setRooms]       = useState<Room[]>([])
  const [loading,     setLoading]     = useState(true)
  const [showFind,    setShowFind]    = useState(false)
  const [code,        setCode]        = useState('')
  const [finding,     setFinding]     = useState(false)
  const [foundUser,   setFoundUser]   = useState<any>(null)
  const [findError,   setFindError]   = useState('')
  const [searchQuery, setSearchQuery] = useState('')

  const supabase = createClient()
  const router   = useRouter()
  const codeRef  = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadRooms()

    // Refresh room list on any new message
    const ch = supabase
      .channel(`user-rooms:${userId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages',
      }, () => loadRooms())
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [userId])

  // ── Load rooms — flat queries, no nested joins ────────────
  async function loadRooms() {
    setLoading(true)

    // 1. Get all room IDs this user belongs to
    const { data: memberships } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', userId)

    if (!memberships?.length) {
      setRooms([])
      setLoading(false)
      return
    }

    const roomIds = [...new Set(memberships.map((m: any) => m.room_id))]

    // 2. Get room details
    const { data: roomsData } = await supabase
      .from('chat_rooms')
      .select('id, name, room_type, is_group, updated_at')
      .in('id', roomIds)

    if (!roomsData?.length) {
      setRooms([])
      setLoading(false)
      return
    }

    // 3. For each room, get other user + last message in parallel
    const processed: Room[] = await Promise.all(
      roomsData.map(async (room: any) => {
        // Get other member's user_id
        const { data: otherMember } = await supabase
          .from('chat_room_members')
          .select('user_id')
          .eq('room_id', room.id)
          .neq('user_id', userId)
          .limit(1)
          .single()

        let otherUser = null
        if (otherMember?.user_id) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('id, full_name, role, default_code, avatar_url')
            .eq('id', otherMember.user_id)
            .single()
          otherUser = profile ?? null
        }

        // Get last message
        const { data: lastMsgs } = await supabase
          .from('chat_messages')
          .select('content, sent_at')
          .eq('room_id', room.id)
          .order('sent_at', { ascending: false })
          .limit(1)

        const lastMsg = lastMsgs?.[0] ?? null

        return {
          id:           room.id,
          name:         otherUser?.full_name ?? room.name ?? 'Chat',
          room_type:    room.room_type,
          updated_at:   lastMsg?.sent_at ?? room.updated_at,
          last_message: lastMsg?.content ?? null,
          last_sent_at: lastMsg?.sent_at ?? null,
          other_user:   otherUser,
        } as Room
      })
    )

    // Sort by most recent, deduplicate by id
    const seen = new Set<string>()
    const unique = processed
      .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true })
      .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())

    setRooms(unique)
    setLoading(false)
  }

  // ── Find user by ID code ──────────────────────────────────
  async function findUserByCode() {
    if (!code.trim()) return
    setFinding(true)
    setFindError('')
    setFoundUser(null)

    const cleaned = code.trim().toUpperCase()

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, school_id')
      .eq('default_code', cleaned)
      .maybeSingle()

    if (data) {
      if (data.id === userId) {
        setFindError("That's your own code!")
        setFinding(false)
        return
      }
      setFoundUser(data)
      setFinding(false)
      return
    }

    // Fuzzy fallback — strip dashes, match last 6 chars
    const stripped = cleaned.replace(/-/g, '').slice(-6)
    const { data: fuzzy } = await supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, school_id')
      .ilike('default_code', `%${stripped}%`)
      .limit(1)
      .maybeSingle()

    if (fuzzy && fuzzy.id !== userId) {
      setFoundUser(fuzzy)
    } else {
      setFindError('No user found with that code. Check and try again.')
    }
    setFinding(false)
  }

  // ── Start or reuse DM ─────────────────────────────────────
  async function startDM() {
    if (!foundUser || finding) return
    setFinding(true)

    // Check for existing DM between these two users
    const { data: myMemberships } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', userId)

    if (myMemberships?.length) {
      const myRoomIds = myMemberships.map((m: any) => m.room_id)

      const { data: theirMemberships } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', foundUser.id)
        .in('room_id', myRoomIds)

      if (theirMemberships?.length) {
        // Found shared room — check it's a DM (not a group)
        const sharedIds = theirMemberships.map((m: any) => m.room_id)
        const { data: existingRoom } = await supabase
          .from('chat_rooms')
          .select('id')
          .in('id', sharedIds)
          .eq('is_group', false)
          .limit(1)
          .single()

        if (existingRoom) {
          // DM already exists — navigate to it
          router.push(`/dashboard/${role}/chat/${existingRoom.id}`)
          setFinding(false)
          return
        }
      }
    }

    // Create a new DM room
    const isCrossSchool = foundUser.school_id !== profile?.school_id
    const { data: newRoom, error } = await supabase
      .from('chat_rooms')
      .insert({
        name:       [profile?.full_name, foundUser.full_name].sort().join(' & '),
        room_type:  getRoomType(role, foundUser.role),
        is_group:   false,
        created_by: userId,
        school_id:  isCrossSchool ? null : profile?.school_id,
      })
      .select('id')
      .single()

    if (error || !newRoom) {
      setFindError(`Could not create chat: ${error?.message ?? 'Unknown error'}`)
      setFinding(false)
      return
    }

    // Add both users as members
    await supabase.from('chat_room_members').insert([
      { room_id: newRoom.id, user_id: userId },
      { room_id: newRoom.id, user_id: foundUser.id },
    ])

    router.push(`/dashboard/${role}/chat/${newRoom.id}`)
    setFinding(false)
  }

  // ── Helpers ───────────────────────────────────────────────
  function timeAgo(d: string) {
    if (!d) return ''
    const diff = Date.now() - new Date(d).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1)     return 'now'
    if (mins < 60)    return `${mins}m`
    if (mins < 1440)  return `${Math.floor(mins / 60)}h`
    if (mins < 10080) return `${Math.floor(mins / 1440)}d`
    return new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })
  }

  const filteredRooms = rooms.filter(r =>
    !searchQuery || r.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  // ── Render ────────────────────────────────────────────────
  return (
    <div className={styles.page}>
      <DashboardHeader
        userId={userId} role={role} profile={profile}
        school={school} schoolColor={schoolColor} title="Messages"
      />

      <div className={styles.chatLayout}>

        {/* ── SIDEBAR ─────────────────────────────────── */}
        <div className={styles.sidebar}>

          {/* Top bar */}
          <div className={styles.sidebarTop}>
            <p className={styles.sidebarTitle}>Chats</p>
            <button
              className={styles.newChatBtn}
              style={{ background: schoolColor }}
              onClick={() => {
                setShowFind(p => !p)
                setFoundUser(null)
                setCode('')
                setFindError('')
                setTimeout(() => codeRef.current?.focus(), 100)
              }}
            >
              {showFind
                ? <XIcon size={15} color="white" />
                : <PlusIcon size={15} color="white" />
              }
            </button>
          </div>

          {/* Search bar — only when there are rooms */}
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
              <p className={styles.findDesc}>Enter the user's ID code to start a chat</p>
              <div className={styles.findRow}>
                <input
                  ref={codeRef}
                  className={styles.findInput}
                  value={code}
                  onChange={e => setCode(e.target.value.toUpperCase())}
                  onKeyDown={e => e.key === 'Enter' && findUserByCode()}
                  placeholder="e.g. SCH-2024-001"
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
                      ? <img src={foundUser.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
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
                      <p style={{ fontSize:'0.72rem', color:'var(--text-faint)', textAlign:'center', padding:'0 16px' }}>
                        Tap + and enter a user's ID code to start chatting
                      </p>
                    </>
                }
              </div>
            ) : (
              filteredRooms.map(room => (
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
                      ? <img src={room.other_user.avatar_url} alt=""
                          style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                      : <span style={{ color:'#fff', fontWeight:700, fontSize:'0.95rem' }}>
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
                    <p className={styles.roomPreview}>
                      {room.last_message
                        ? (room.last_message.length > 45
                            ? room.last_message.slice(0, 45) + '…'
                            : room.last_message)
                        : (room.other_user?.default_code ?? '')
                      }
                    </p>
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* ── EMPTY STATE (desktop right pane) ──────── */}
        <div className={styles.emptyChat}>
          <div className={styles.emptyChatIcon} style={{ background: `${schoolColor}15` }}>
            <MessageIcon size={36} color={schoolColor} strokeWidth={1.5} />
          </div>
          <h3>Select a conversation</h3>
          <p>Choose a chat from the list, or tap + to start a new one with an ID code.</p>
        </div>

      </div>
    </div>
  )
}
