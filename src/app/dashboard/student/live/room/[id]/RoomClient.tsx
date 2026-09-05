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
import styles from '@/components/live/live-room.module.css'

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

  if (loading) return <div className={styles.centerState}>Joining class…</div>
  if (error) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorTitle}>Couldn't join this class</p>
        <p className={styles.errorBody}>{error}</p>
        <button onClick={() => router.push('/dashboard/student/live')} className={styles.errorLink}>
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
    <div className={styles.page}>
      <div className={styles.main}>
        {connectionState === ConnectionState.Reconnecting && (
          <div className={`${styles.banner} ${styles.bannerWarning}`}>
            Connection interrupted — reconnecting…
          </div>
        )}

        <div className={styles.videoArea}>
          {teacherCameraTrack ? (
            <ParticipantTile trackRef={teacherCameraTrack} />
          ) : (
            <p className={styles.placeholderText}>Waiting for the teacher's video…</p>
          )}
        </div>

        <div className={styles.topBar}>
          <div className={styles.controls}>
            <TrackToggle
              source={Track.Source.Microphone}
              showIcon
              disabled={!canSpeak}
              className={styles.controlBtn}
            />
            <TrackToggle
              source={Track.Source.Camera}
              showIcon
              disabled={!canSpeak}
              className={styles.controlBtn}
            />
            {!canSpeak && (
              <button
                onClick={selfRaised ? lowerHand : raiseHand}
                className={`${styles.pillBtn} ${selfRaised ? styles.raiseHandBtnActive : styles.raiseHandBtn}`}
              >
                {selfRaised ? '✋ Hand raised — tap to lower' : '✋ Raise hand / request to speak'}
              </button>
            )}
            {canSpeak && <span className={styles.speakingTag}>You've been given permission to speak</span>}
          </div>
          <DisconnectButton className={`${styles.pillBtn} ${styles.neutralBtn}`}>Leave class</DisconnectButton>
        </div>
      </div>

      <aside className={styles.sidebar}>
        <div className={styles.chatSection}>
          <h3 className={styles.sectionHeading}>Class chat</h3>
          <div className={styles.chatMessages}>
            {messages.map((m, i) => (
              <div key={i} className={styles.chatMessage}><span className={styles.chatMessageName}>{m.name}:</span> {m.text}</div>
            ))}
          </div>
          <div className={styles.chatInputRow}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Message the class…"
              className={styles.chatInput}
            />
            <button onClick={handleSend} className={styles.chatSendBtn}>Send</button>
          </div>
        </div>
        {raisedHands.size > 0 && (
          <p className={styles.emptyHint}>{raisedHands.size} hand(s) raised in class</p>
        )}
      </aside>
    </div>
  )
}
