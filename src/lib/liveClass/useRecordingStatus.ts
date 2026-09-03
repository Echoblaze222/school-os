'use client'
// src/lib/liveClass/useRecordingStatus.ts
//
// Recording start/stop is a server action (only the host, only via
// /api/live/recording/start|stop, which each independently re-verify
// authorization — see those routes). This hook does NOT start or stop
// anything; it only broadcasts/receives the resulting state over the
// data channel, same as raise-hand and chat, so every connected
// participant — not just whoever was in the room when it started — sees
// accurate "recording" status without polling or reconnecting.
//
// Initial state still comes from the token response (both RoomClient
// components pass `initialRecording` in), since a participant who joins
// mid-recording has no earlier broadcast to have received.

import { useCallback, useState } from 'react'
import { useDataChannel } from '@livekit/components-react'

const TOPIC = 'recording-status'

export function useRecordingStatus(initialRecording: boolean) {
  const [recording, setRecording] = useState(initialRecording)

  const { send } = useDataChannel(TOPIC, (msg) => {
    try {
      const decoded = JSON.parse(new TextDecoder().decode(msg.payload)) as { recording: boolean }
      setRecording(decoded.recording)
    } catch {
      // Ignore malformed/mismatched-version payloads.
    }
  })

  /** Called by the host after a successful /api/live/recording/start|stop response — broadcasts the new state to everyone else in the room. */
  const broadcast = useCallback(async (next: boolean) => {
    setRecording(next)
    await send(new TextEncoder().encode(JSON.stringify({ recording: next })), { reliable: true })
  }, [send])

  return { recording, broadcast }
}
