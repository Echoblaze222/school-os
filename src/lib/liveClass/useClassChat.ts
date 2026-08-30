'use client'
// src/lib/liveClass/useClassChat.ts
//
// In-room chat, same reasoning as useRaiseHand: rides LiveKit's data
// channel, not Postgres. Chat history for a live class isn't a durable
// record SchoolOS needs to keep (unlike attendance) — per the
// architecture requirement to persist only what actually needs to
// survive the session, this intentionally has no database table. If a
// "save the chat transcript" requirement shows up later, it belongs in
// Phase 2/3 as a deliberate decision, not something to bolt on here.

import { useCallback, useState } from 'react'
import { useDataChannel, useLocalParticipant } from '@livekit/components-react'

const TOPIC = 'class-chat'

export interface ChatEntry {
  identity: string
  name: string
  text: string
  at: number
}

export function useClassChat() {
  const { localParticipant } = useLocalParticipant()
  const [messages, setMessages] = useState<ChatEntry[]>([])

  const { send } = useDataChannel(TOPIC, (msg) => {
    try {
      const entry = JSON.parse(new TextDecoder().decode(msg.payload)) as ChatEntry
      setMessages(prev => [...prev, entry].slice(-200)) // cap in-memory history; this is a live session aid, not a transcript
    } catch {
      // Ignore malformed/mismatched-version payloads rather than crash the room UI.
    }
  })

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    const entry: ChatEntry = {
      identity: localParticipant.identity,
      name: localParticipant.name || localParticipant.identity,
      text: trimmed,
      at: Date.now(),
    }
    setMessages(prev => [...prev, entry].slice(-200))
    await send(new TextEncoder().encode(JSON.stringify(entry)), { reliable: true })
  }, [localParticipant, send])

  return { messages, sendMessage }
}
