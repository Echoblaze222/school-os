'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import DashboardHeader from '@/components/DashboardHeader'
import {
  MessageIcon, SearchIcon, PlusIcon,
  UserIcon, XIcon, ArrowLeftIcon, PeopleIcon,
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
  is_group?:     boolean
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
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [suggesting,  setSuggesting]  = useState(false)

  // ── New Group creation (separate flow from the New Message find-by-code above) ──
  const [showNewGroup,      setShowNewGroup]      = useState(false)
  const [groupName,         setGroupName]         = useState('')
  const [groupSearch,       setGroupSearch]       = useState('')
  const [groupSuggestions,  setGroupSuggestions]  = useState<any[]>([])
  const [groupSuggesting,   setGroupSuggesting]   = useState(false)
  const [groupSelected,     setGroupSelected]     = useState<any[]>([])
  const [creatingGroup,     setCreatingGroup]     = useState(false)
  const [groupError,        setGroupError]        = useState('')

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

  // ── Load rooms - flat queries, no nested joins ────────────
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
        let otherUser = null

        // Group rooms (class/school community) have their own name - looking
        // up "the other member" doesn't make sense with 3+ people and was
        // picking an arbitrary member's name to display instead of the
        // group's actual name.
        if (!room.is_group) {
          const { data: otherMember } = await supabase
            .from('chat_room_members')
            .select('user_id')
            .eq('room_id', room.id)
            .neq('user_id', userId)
            .limit(1)
            .single()

          if (otherMember?.user_id) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, full_name, role, default_code, avatar_url')
              .eq('id', otherMember.user_id)
              .single()
            otherUser = profile ?? null
          }
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
          // Group rooms use their stored name. For DMs, prefer the other
          // participant's live profile name; only if that lookup fails do
          // we fall back to the room's stored "PersonA & PersonB" label -
          // and even then, strip our own name out of it so we never show
          // both people's names in the list.
          name:         room.is_group
                          ? (room.name ?? 'Group')
                          : (otherUser?.full_name
                              ?? room.name?.split(' & ').find((n: string) => n.trim() !== profile?.full_name?.trim())?.trim()
                              ?? room.name
                              ?? 'Chat'),
          room_type:    room.room_type,
          is_group:     room.is_group,
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

  // ── Live suggestions as you type an access code ────────────
  // Everyone else is scoped to their own school - a secretary shouldn't be
  // able to browse codes from a school they're not part of. Principals are
  // the one exception: they can also match other schools' principals, since
  // principal-to-principal is the one cross-school conversation that's
  // expected to happen.
  useEffect(() => {
    if (!showFind) { setSuggestions([]); return }
    const trimmed = code.trim()
    if (trimmed.length < 2) { setSuggestions([]); return }
    const handle = setTimeout(() => searchSuggestions(trimmed), 250)
    return () => clearTimeout(handle)
  }, [code, showFind])

  async function searchSuggestions(query: string) {
    setSuggesting(true)
    const cleaned = query.toUpperCase()

    let q = supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, school_id')
      .ilike('default_code', `%${cleaned}%`)
      .neq('id', userId)
      .limit(8)

    q = role === 'principal'
      // own school (any role) OR any principal anywhere
      ? q.or(`school_id.eq.${profile?.school_id},role.eq.principal`)
      // everyone else stays inside their own school
      : q.eq('school_id', profile?.school_id)

    const { data } = await q
    setSuggestions(data ?? [])
    setSuggesting(false)
  }

  function pickSuggestion(user: any) {
    setFoundUser(user)
    setCode(user.default_code ?? '')
    setSuggestions([])
    setFindError('')
  }

  // ── New Group: live suggestions as you type a name or code ─────────
  useEffect(() => {
    if (!showNewGroup) { setGroupSuggestions([]); return }
    const trimmed = groupSearch.trim()
    if (trimmed.length < 2) { setGroupSuggestions([]); return }
    const handle = setTimeout(() => searchGroupSuggestions(trimmed), 250)
    return () => clearTimeout(handle)
  }, [groupSearch, showNewGroup, groupSelected])

  async function searchGroupSuggestions(query: string) {
    setGroupSuggesting(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, school_id')
      .or(`full_name.ilike.%${query}%,default_code.ilike.%${query.toUpperCase()}%`)
      .eq('school_id', profile?.school_id)
      .neq('id', userId)
      .limit(8)

    const selectedIds = new Set(groupSelected.map(m => m.id))
    setGroupSuggestions((data ?? []).filter(u => !selectedIds.has(u.id)))
    setGroupSuggesting(false)
  }

  function addGroupMember(user: any) {
    setGroupSelected(prev => (prev.find(m => m.id === user.id) ? prev : [...prev, user]))
    setGroupSuggestions([])
    setGroupSearch('')
  }

  function removeGroupMember(id: string) {
    setGroupSelected(prev => prev.filter(m => m.id !== id))
  }

  function closeAllComposePanels() {
    setShowFind(false)
    setShowNewGroup(false)
    setFoundUser(null)
    setCode('')
    setFindError('')
    setGroupName('')
    setGroupSearch('')
    setGroupSelected([])
    setGroupSuggestions([])
    setGroupError('')
  }

  async function createGroup() {
    if (!groupName.trim() || groupSelected.length === 0 || creatingGroup) return
    setCreatingGroup(true)
    setGroupError('')

    const { data: roomId, error } = await supabase.rpc('create_peer_group', {
      _name: groupName.trim(),
      _member_ids: groupSelected.map(m => m.id),
    })

    if (error || !roomId) {
      setGroupError(`Could not create group: ${error?.message ?? 'Unknown error'}`)
      setCreatingGroup(false)
      return
    }

    router.push(`/dashboard/${role}/chat/${roomId}`)
  }


  // ── Find user by ID code (exact + fuzzy fallback) ──────────
  async function findUserByCode() {
    if (!code.trim()) return
    setFinding(true)
    setFindError('')
    setFoundUser(null)

    const cleaned = code.trim().toUpperCase()

    let exact = supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, school_id')
      .eq('default_code', cleaned)

    exact = role === 'principal'
      ? exact.or(`school_id.eq.${profile?.school_id},role.eq.principal`)
      : exact.eq('school_id', profile?.school_id)

    const { data } = await exact.maybeSingle()

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

    // Fuzzy fallback - strip dashes, match last 6 chars
    const stripped = cleaned.replace(/-/g, '').slice(-6)
    let fuzzy = supabase
      .from('profiles')
      .select('id, full_name, role, default_code, avatar_url, school_id')
      .ilike('default_code', `%${stripped}%`)

    fuzzy = role === 'principal'
      ? fuzzy.or(`school_id.eq.${profile?.school_id},role.eq.principal`)
      : fuzzy.eq('school_id', profile?.school_id)

    const { data: fuzzyMatch } = await fuzzy.limit(1).maybeSingle()

    if (fuzzyMatch && fuzzyMatch.id !== userId) {
      setFoundUser(fuzzyMatch)
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
        // Found shared room - check it's a DM (not a group)
        const sharedIds = theirMemberships.map((m: any) => m.room_id)
        const { data: existingRoom } = await supabase
          .from('chat_rooms')
          .select('id')
          .in('id', sharedIds)
          .eq('is_group', false)
          .limit(1)
          .single()

        if (existingRoom) {
          // DM already exists - navigate to it
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
            <button
              className={styles.backToDashBtn}
              onClick={() => router.push(`/dashboard/${role}`)}
              title="Back to dashboard"
            >
              <ArrowLeftIcon size={16} />
            </button>
            <p className={styles.sidebarTitle}>Chats</p>
            <button
              className={styles.newGroupBtn}
              title="New group"
              onClick={() => {
                const opening = !showNewGroup
                closeAllComposePanels()
                setShowNewGroup(opening)
              }}
            >
              {showNewGroup
                ? <XIcon size={15} color="var(--text-muted)" />
                : <PeopleIcon size={15} color="var(--text-muted)" />
              }
            </button>
            <button
              className={styles.newChatBtn}
              style={{ background: schoolColor }}
              onClick={() => {
                const opening = !showFind
                closeAllComposePanels()
                setShowFind(opening)
                setTimeout(() => codeRef.current?.focus(), 100)
              }}
            >
              {showFind
                ? <XIcon size={15} color="white" />
                : <PlusIcon size={15} color="white" />
              }
            </button>
          </div>

          {/* New Group panel */}
          {showNewGroup && (
            <div className={styles.findPanel}>
              <p className={styles.findTitle}>New Group</p>
              <p className={styles.findDesc}>Add people from your school, then name the group.</p>
              <div className={styles.findRow}>
                <input
                  className={styles.findInput}
                  style={{ textTransform: 'none', letterSpacing: 0 }}
                  value={groupSearch}
                  onChange={e => setGroupSearch(e.target.value)}
                  placeholder="Search by name or ID code"
                />
              </div>

              {groupSearch.trim().length >= 2 && (groupSuggesting || groupSuggestions.length > 0) && (
                <div className={styles.suggestList}>
                  {groupSuggesting && groupSuggestions.length === 0 && (
                    <div className={styles.suggestLoading}>
                      <span/><span/><span/>
                    </div>
                  )}
                  {groupSuggestions.map(u => (
                    <button key={u.id} className={styles.suggestItem} onClick={() => addGroupMember(u)}>
                      <div className={styles.suggestAvatar} style={{ background: ROLE_COLORS[u.role] ?? schoolColor }}>
                        {u.avatar_url
                          ? <img src={u.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                          : <span style={{ color:'#fff', fontWeight:700, fontSize:'0.75rem' }}>{u.full_name?.[0]}</span>
                        }
                      </div>
                      <div className={styles.suggestInfo}>
                        <p className={styles.suggestName}>{u.full_name}</p>
                        <p className={styles.suggestMeta}>{u.role} · {u.default_code}</p>
                      </div>
                      <PlusIcon size={14} color="var(--text-muted)" />
                    </button>
                  ))}
                </div>
              )}

              {groupSelected.length > 0 && (
                <div className={styles.groupChips}>
                  {groupSelected.map(u => (
                    <span key={u.id} className={styles.groupChip}>
                      {u.full_name}
                      <button onClick={() => removeGroupMember(u.id)} title="Remove">
                        <XIcon size={10} />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className={styles.findRow}>
                <input
                  className={styles.findInput}
                  style={{ textTransform: 'none', letterSpacing: 0 }}
                  value={groupName}
                  onChange={e => setGroupName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && createGroup()}
                  placeholder="Group name"
                />
                <button
                  className={styles.findBtn}
                  style={{ background: schoolColor }}
                  onClick={createGroup}
                  disabled={creatingGroup || !groupName.trim() || groupSelected.length === 0}
                >
                  {creatingGroup ? '…' : <PeopleIcon size={15} color="white" />}
                </button>
              </div>

              {groupError && <p className={styles.findError}>{groupError}</p>}
            </div>
          )}

          {/* Search bar - only when there are rooms */}
          {!showFind && !showNewGroup && rooms.length > 0 && (
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
              <p className={styles.findDesc}>
                {role === 'principal'
                  ? "Type a code to search your school, or another principal, anywhere"
                  : "Start typing a code. Matches from your school will show up"}
              </p>
              <div className={styles.findRow}>
                <input
                  ref={codeRef}
                  className={styles.findInput}
                  value={code}
                  onChange={e => { setCode(e.target.value.toUpperCase()); setFoundUser(null); setFindError('') }}
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

              {/* Live suggestions - same-school only, except a principal also
                  sees principals from other schools */}
              {!foundUser && code.trim().length >= 2 && (suggesting || suggestions.length > 0) && (
                <div className={styles.suggestList}>
                  {suggesting && suggestions.length === 0 && (
                    <div className={styles.suggestLoading}>
                      <span/><span/><span/>
                    </div>
                  )}
                  {suggestions.map(u => {
                    const crossSchool = u.school_id !== profile?.school_id
                    return (
                      <button key={u.id} className={styles.suggestItem} onClick={() => pickSuggestion(u)}>
                        <div className={styles.suggestAvatar} style={{ background: ROLE_COLORS[u.role] ?? schoolColor }}>
                          {u.avatar_url
                            ? <img src={u.avatar_url} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                            : <span style={{ color:'#fff', fontWeight:700, fontSize:'0.75rem' }}>{u.full_name?.[0]}</span>
                          }
                        </div>
                        <div className={styles.suggestInfo}>
                          <p className={styles.suggestName}>{u.full_name}</p>
                          <p className={styles.suggestMeta}>{u.role} · {u.default_code}</p>
                        </div>
                        {crossSchool && <span className={styles.suggestBadge}>other school</span>}
                      </button>
                    )
                  })}
                </div>
              )}

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
                    <p className={styles.foundMeta}>
                      {foundUser.role} · {foundUser.default_code}
                      {foundUser.school_id !== profile?.school_id && ' · other school'}
                    </p>
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
                    {room.room_type === 'school_group' && school?.logo_url
                      ? <img src={school.logo_url} alt=""
                          style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                      : room.room_type === 'peer_group'
                      ? <PeopleIcon size={18} color="#fff" />
                      : room.other_user?.avatar_url
                      ? <img src={room.other_user.avatar_url} alt=""
                          style={{ width:'100%', height:'100%', objectFit:'cover', borderRadius:'50%' }} />
                      : <span style={{ color:'#fff', fontWeight:700, fontSize:'0.95rem' }}>
                          {room.name[0]?.toUpperCase()}
                        </span>
                    }
                  </div>
                  <div className={styles.roomInfo}>
                    <div className={styles.roomTopRow}>
                      <p className={styles.roomName}>
                        {room.room_type === 'school_group' ? '🏫 ' : room.room_type === 'class_group' ? '👥 ' : ''}
                        {room.name}
                      </p>
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
