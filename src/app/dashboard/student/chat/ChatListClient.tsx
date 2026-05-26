'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import styles from './chat.module.css'

interface Props {
  memberships: any[]
  currentUserId: string
  profile: any
}

export default function ChatListClient({ memberships, currentUserId, profile }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [searchQuery, setSearchQuery] = useState('')
  const [showNewChat, setShowNewChat] = useState(false)
  const [searchUser, setSearchUser] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('schoolos_theme') as 'dark' | 'light' | null
    if (saved) {
      setTheme(saved)
      document.documentElement.setAttribute('data-theme', saved === 'light' ? 'light' : '')
    }
  }, [])

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    localStorage.setItem('schoolos_theme', next)
    document.documentElement.setAttribute('data-theme', next === 'light' ? 'light' : '')
  }

  // Search for users to start a new chat with
  async function handleUserSearch(query: string) {
    setSearchUser(query)
    if (query.length < 2) { setSearchResults([]); return }

    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, role, avatar_url')
      .ilike('full_name', `%${query}%`)
      .neq('id', currentUserId)
      .limit(8)

    setSearchResults(data ?? [])
  }

  // Start a new 1-on-1 chat
  async function startChat(otherUser: any) {
    setCreating(true)

    // Check if a room already exists between these two users
    const { data: existing } = await supabase
      .from('chat_room_members')
      .select('room_id')
      .eq('user_id', currentUserId)

    const myRoomIds = existing?.map(m => m.room_id) ?? []

    if (myRoomIds.length > 0) {
      const { data: shared } = await supabase
        .from('chat_room_members')
        .select('room_id')
        .eq('user_id', otherUser.id)
        .in('room_id', myRoomIds)

      if (shared && shared.length > 0) {
        router.push(`/dashboard/student/chat/${shared[0].room_id}`)
        return
      }
    }

    // Create a new chat room
    const { data: room, error } = await supabase
      .from('chat_rooms')
      .insert({
        room_type: 'student_to_student',
        is_group: false,
        created_by: currentUserId,
      })
      .select()
      .single()

    if (error || !room) { setCreating(false); return }

    // Add both users as members
    await supabase.from('chat_room_members').insert([
      { room_id: room.id, user_id: currentUserId },
      { room_id: room.id, user_id: otherUser.id },
    ])

    setCreating(false)
    router.push(`/dashboard/student/chat/${room.id}`)
  }

  // Get the display name for a room
  function getRoomName(membership: any) {
    return membership.chat_rooms?.name ?? 'Conversation'
  }

  // Get last message preview
  function getLastMessage(membership: any) {
    const messages = membership.chat_rooms?.chat_messages
    if (!messages || messages.length === 0) return 'No messages yet'
    const last = messages[messages.length - 1]
    const isMe = last.sender_id === currentUserId
    return `${isMe ? 'You: ' : ''}${last.content ?? 'Sent a file'}`
  }

  // Format timestamp
  function formatTime(timestamp: string) {
    if (!timestamp) return ''
    const date = new Date(timestamp)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (days === 1) return 'Yesterday'
    if (days < 7) return date.toLocaleDateString([], { weekday: 'short' })
    return date.toLocaleDateString([], { day: '2-digit', month: 'short' })
  }

  const filtered = memberships.filter(m =>
    getRoomName(m).toLowerCase().includes(searchQuery.toLowerCase())
  )

  return (
    <div className={styles.chatApp}>

      {/* Header */}
      <header className={styles.header}>
        <button className={styles.backBtn} onClick={() => router.push('/dashboard/student')}>
          ←
        </button>
        <h1 className={styles.headerTitle}>Messages</h1>
        <div className={styles.headerActions}>
          <button className={styles.iconBtn} onClick={toggleTheme}>
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          <button
            className={`${styles.iconBtn} ${styles.newChatBtn}`}
            onClick={() => setShowNewChat(true)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
  <line x1="12" y1="5" x2="12" y2="19"/>
  <line x1="5" y1="12" x2="19" y2="12"/>
</svg>

          </button>
        </div>
      </header>

      {/* Search */}
      <div className={styles.searchBar}>
        <span>🔍</span>
        <input
          type="text"
          placeholder="Search conversations..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className={styles.searchInput}
        />
      </div>

      {/* Chat list */}
      <div className={styles.chatList}>
        {filtered.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyIcon}>💬</p>
            <p className={styles.emptyTitle}>No conversations yet</p>
            <p className={styles.emptySubtitle}>Tap the pencil icon to start a new chat</p>
          </div>
        ) : (
          filtered.map((membership) => {
            const room = membership.chat_rooms
            const messages = room?.chat_messages ?? []
            const lastMsg = messages[messages.length - 1]

            return (
              <button
                key={membership.room_id}
                className={styles.chatItem}
                onClick={() => router.push(`/dashboard/student/chat/${membership.room_id}`)}
              >
                {/* Avatar */}
                <div className={styles.chatAvatar}>
                  <span>{getRoomName(membership)[0]?.toUpperCase()}</span>
                </div>

                {/* Content */}
                <div className={styles.chatContent}>
                  <div className={styles.chatTopRow}>
                    <span className={styles.chatName}>{getRoomName(membership)}</span>
                    <span className={styles.chatTime}>
                      {lastMsg ? formatTime(lastMsg.sent_at) : ''}
                    </span>
                  </div>
                  <div className={styles.chatBottomRow}>
                    <span className={styles.chatPreview}>{getLastMessage(membership)}</span>
                  </div>
                </div>
              </button>
            )
          })
        )}
      </div>

      {/* New Chat Modal */}
      {showNewChat && (
        <div className={styles.modalOverlay} onClick={() => setShowNewChat(false)}>
          <div className={styles.modal} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>New Conversation</h2>
              <button onClick={() => setShowNewChat(false)}>✕</button>
            </div>

            <div className={styles.modalSearch}>
              <input
                type="text"
                placeholder="Search by name..."
                value={searchUser}
                onChange={e => handleUserSearch(e.target.value)}
                className={styles.modalSearchInput}
                autoFocus
              />
            </div>

            <div className={styles.userResults}>
              {searchResults.map(user => (
                <button
                  key={user.id}
                  className={styles.userResult}
                  onClick={() => startChat(user)}
                  disabled={creating}
                >
                  <div className={styles.userAvatar}>
                    {user.avatar_url
                      ? <img src={user.avatar_url} alt={user.full_name} />
                      : <span>{user.full_name[0]?.toUpperCase()}</span>
                    }
                  </div>
                  <div className={styles.userInfo}>
                    <span className={styles.userName}>{user.full_name}</span>
                    <span className={styles.userRole}>{user.role}</span>
                  </div>
                </button>
              ))}
              {searchUser.length >= 2 && searchResults.length === 0 && (
                <p className={styles.noResults}>No users found</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <nav className="bottom-nav">
        <a href="/dashboard/student/notes" className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
          <span>Learn</span>
        </a>
        <a href="/dashboard/student/results" className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
          <span>Results</span>
        </a>
        <a href="/dashboard/student" className="nav-home">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
        </a>
        <a href="/dashboard/student/chat" className="nav-item active">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span>Chat</span>
        </a>
        <a href="/dashboard/student/ai" className="nav-item">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>
          <span>AI</span>
        </a>
      </nav>

    </div>
  )
}
