'use client'
// src/app/dashboard/student/live/room/[id]/RoomClient.tsx
//
// Student's live classroom view. Joins muted/camera-off by default (the
// token minted for a participant grants NO publish rights at all — see
// livekit.ts) and stays that way until the teacher explicitly authorizes
// this specific student via /api/live/permission. That authorization
// changes the actual server-side LiveKit permission on this participant;
// this component just reacts to it (useLocalParticipantPermissions),
// it never grants itself anything.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useTracks,
  useParticipants,
  useLocalParticipantPermissions,
  ParticipantTile,
  TrackToggle,
  DisconnectButton,
  ConnectionStateToast,
  useConnectionState,
} from '@livekit/components-react'
import { Track, ConnectionState } from 'livekit-client'
import '@livekit/components-styles'
import { useRaiseHand } from '@/lib/liveClass/useRaiseHand'
import { useClassChat } from '@/lib/liveClass/useClassChat'

interface Props {
  onlineClassId: string
  userId: string
  school: any
  profile: any
}

export default function RoomClient({ onlineClassId }: Props) {
  const router = useRouter()
  const [connection, setConnection] = useState<{ token: string; url: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchToken() {
      try {
        const res = await fetch('/api/live/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onlineClassId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not join this class.')
        if (!cancelled) setConnection({ token: data.token, url: data.url })
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchToken()
    return () => { cancelled = true }
  }, [onlineClassId])

  if (loading) return <div className="p-6 text-center text-gray-500">Joining class…</div>
  if (error) {
    return (
      <div className="p-6 max-w-md mx-auto text-center">
        <p className="text-red-600 font-medium mb-2">Couldn't join this class</p>
        <p className="text-gray-600 text-sm mb-4">{error}</p>
        <button onClick={() => router.push('/dashboard/student/live')} className="text-blue-600 underline">
          Back to Live Classes
        </button>
      </div>
    )
  }
  if (!connection) return null

  return (
    <LiveKitRoom
      serverUrl={connection.url}
      token={connection.token}
      video={false}
      audio={false}
      connect
      onDisconnected={() => router.push('/dashboard/student/live')}
      data-lk-theme="default"
      style={{ height: '100vh' }}
    >
      <StudentRoomInner onlineClassId={onlineClassId} />
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LiveKitRoom>
  )
}

function StudentRoomInner({ onlineClassId }: { onlineClassId: string }) {
  const participants = useParticipants()
  const permissions = useLocalParticipantPermissions()
  const connectionState = useConnectionState()
  const { raisedHands, selfRaised, raiseHand, lowerHand } = useRaiseHand()
  const { messages, sendMessage } = useClassChat()
  const [chatInput, setChatInput] = useState('')

  // Teacher = whichever participant was issued a host token (see the
  // `attributes: { role }` set at mint time in livekit.ts). Display-only
  // identification, not a security check — nothing here grants anyone
  // anything based on this attribute.
  const teacher = participants.find(p => p.attributes?.role === 'host')
  const teacherCameraTrack = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }])
    .find(t => teacher && t.participant.identity === teacher.identity)

  const canSpeak = !!permissions?.canPublish

  // Once the teacher grants publish rights, this student's own raised
  // hand no longer needs to be showing — lower it automatically so the
  // teacher's queue reflects reality without a second manual step.
  useEffect(() => {
    if (canSpeak && selfRaised) lowerHand()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSpeak])

  const handleSend = useCallback(() => {
    sendMessage(chatInput)
    setChatInput('')
  }, [chatInput, sendMessage])

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col p-4 gap-4">
        {connectionState === ConnectionState.Reconnecting && (
          <div className="text-sm text-amber-700 bg-amber-50 rounded px-3 py-1">
            Connection interrupted — reconnecting…
          </div>
        )}

        <div className="flex-1 grid place-items-center bg-black rounded-lg overflow-hidden">
          {teacherCameraTrack ? (
            <ParticipantTile trackRef={teacherCameraTrack} />
          ) : (
            <p className="text-gray-400 text-sm">Waiting for the teacher's video…</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <TrackToggle
              source={Track.Source.Microphone}
              showIcon
              disabled={!canSpeak}
              className="px-3 py-1 rounded bg-gray-200 disabled:opacity-40"
            />
            <TrackToggle
              source={Track.Source.Camera}
              showIcon
              disabled={!canSpeak}
              className="px-3 py-1 rounded bg-gray-200 disabled:opacity-40"
            />
            {!canSpeak && (
              <button
                onClick={selfRaised ? lowerHand : raiseHand}
                className={`px-3 py-1 rounded ${selfRaised ? 'bg-yellow-300' : 'bg-yellow-100'}`}
              >
                {selfRaised ? '✋ Hand raised — tap to lower' : '✋ Raise hand / request to speak'}
              </button>
            )}
            {canSpeak && <span className="text-sm text-green-700">You've been given permission to speak</span>}
          </div>
          <DisconnectButton className="px-4 py-1 rounded bg-gray-700 text-white">Leave class</DisconnectButton>
        </div>
      </div>

      <aside className="w-72 border-l p-4 flex flex-col">
        <h3 className="font-semibold mb-2">Class chat</h3>
        <div className="flex-1 overflow-y-auto space-y-1 mb-2 text-sm">
          {messages.map((m, i) => (
            <div key={i}><span className="font-medium">{m.name}:</span> {m.text}</div>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Message the class…"
            className="flex-1 border rounded px-2 py-1 text-sm"
          />
          <button onClick={handleSend} className="px-3 py-1 rounded bg-blue-600 text-white text-sm">Send</button>
        </div>
        {raisedHands.size > 0 && (
          <p className="text-xs text-gray-400 mt-2">{raisedHands.size} hand(s) raised in class</p>
        )}
      </aside>
    </div>
  )
}
