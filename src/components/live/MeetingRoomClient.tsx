'use client'
// src/components/live/MeetingRoomClient.tsx
//
// Unlike class rooms (which have separate Teacher/Student RoomClient
// components, because "teacher" vs "student" is a stable identity), a
// meeting's host/participant role is decided per-meeting by
// decideMeetingAccess — the same teacher could host one PTA meeting they
// scheduled and simply attend another they didn't. So this component
// doesn't take a role prop; it fetches a token from /api/live/meeting/token
// and renders host or participant controls based on WHAT THE SERVER SAID
// the caller's role is for this specific meeting, not which page loaded it.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useLocalParticipantPermissions,
  useTracks,
  ParticipantTile,
  TrackToggle,
  ConnectionStateToast,
  useConnectionState,
} from '@livekit/components-react'
import { Track, ConnectionState } from 'livekit-client'
import '@livekit/components-styles'
import { useRaiseHand } from '@/lib/liveClass/useRaiseHand'
import { useClassChat } from '@/lib/liveClass/useClassChat'
import { useRecordingStatus } from '@/lib/liveClass/useRecordingStatus'
import styles from './live-room.module.css'

interface Props {
  meetingId: string
  /** Where to send the user after leaving/ending — the list page they came from. */
  backHref: string
}

export default function MeetingRoomClient({ meetingId, backHref }: Props) {
  const router = useRouter()
  const [connection, setConnection] = useState<{ token: string; url: string; role: 'host' | 'participant'; recording: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function fetchToken() {
      try {
        const res = await fetch('/api/live/meeting/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ meetingId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Could not join this meeting.')
        if (!cancelled) setConnection({ token: data.token, url: data.url, role: data.role, recording: !!data.recording })
      } catch (err) {
        if (!cancelled) setError((err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchToken()
    return () => { cancelled = true }
  }, [meetingId])

  if (loading) return <div className={styles.centerState}>Joining meeting…</div>
  if (error) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorTitle}>Couldn't join this meeting</p>
        <p className={styles.errorBody}>{error}</p>
        <button onClick={() => router.push(backHref)} className={styles.errorLink}>Back to Meetings</button>
      </div>
    )
  }
  if (!connection) return null

  const isHost = connection.role === 'host'

  return (
    <LiveKitRoom
      serverUrl={connection.url}
      token={connection.token}
      video={isHost}
      audio={isHost}
      connect
      onDisconnected={() => router.push(backHref)}
      data-lk-theme="default"
      style={{ height: '100vh' }}
    >
      <MeetingRoomInner meetingId={meetingId} isHost={isHost} initialRecording={connection.recording} backHref={backHref} />
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LiveKitRoom>
  )
}

function MeetingRoomInner({ meetingId, isHost, initialRecording, backHref }: { meetingId: string; isHost: boolean; initialRecording: boolean; backHref: string }) {
  const router = useRouter()
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const localPermissions = useLocalParticipantPermissions()
  const connectionState = useConnectionState()
  const { raisedHands, selfRaised, raiseHand, lowerHand } = useRaiseHand()
  const { messages, sendMessage } = useClassChat()
  const { recording, broadcast: broadcastRecording } = useRecordingStatus(initialRecording)
  const [chatInput, setChatInput] = useState('')
  const [ending, setEnding] = useState(false)
  const [recordingBusy, setRecordingBusy] = useState(false)
  const [recordingError, setRecordingError] = useState<string | null>(null)
  const [permissionBusy, setPermissionBusy] = useState<string | null>(null)

  const selfTracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }], { onlySubscribed: false })
    .filter(t => t.participant.isLocal)
  const canSpeak = isHost || !!localPermissions?.canPublish

  useEffect(() => {
    if (canSpeak && selfRaised) lowerHand()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSpeak])

  const handleEndMeeting = useCallback(async () => {
    if (!confirm('End this meeting for everyone?')) return
    setEnding(true)
    try {
      await fetch('/api/live/meeting/end', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meetingId }) })
    } finally {
      router.push(backHref)
    }
  }, [meetingId, backHref, router])

  const toggleRecording = useCallback(async () => {
    setRecordingBusy(true)
    setRecordingError(null)
    const endpoint = recording ? '/api/live/meeting/recording/stop' : '/api/live/meeting/recording/start'
    try {
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ meetingId }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Recording action failed.')
      await broadcastRecording(!recording)
    } catch (err) {
      setRecordingError((err as Error).message)
    } finally {
      setRecordingBusy(false)
    }
  }, [recording, meetingId, broadcastRecording])

  const setParticipantPermission = useCallback(async (participantIdentity: string, canPublishAudio: boolean, canPublishVideo: boolean) => {
    setPermissionBusy(participantIdentity)
    try {
      await fetch('/api/live/meeting/permission', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ meetingId, participantIdentity, canPublishAudio, canPublishVideo }),
      })
    } finally {
      setPermissionBusy(null)
    }
  }, [meetingId])

  const handleSend = useCallback(() => { sendMessage(chatInput); setChatInput('') }, [chatInput, sendMessage])

  const remoteParticipants = participants.filter(p => !p.isLocal)
  const host = participants.find(p => p.attributes?.role === 'host')
  const hostCameraTrack = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }])
    .find(t => host && t.participant.identity === host.identity)

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        {connectionState === ConnectionState.Reconnecting && (
          <div className={`${styles.banner} ${styles.bannerWarning}`}>Connection interrupted — reconnecting…</div>
        )}
        {recording && (
          <div className={`${styles.banner} ${styles.bannerDanger}`}>● This meeting is being recorded</div>
        )}

        <div className={styles.topBar}>
          <div className={styles.statusText}>{participants.length} in meeting</div>
          <div className={styles.controls}>
            {isHost && (
              <button onClick={toggleRecording} disabled={recordingBusy}
                className={`${styles.pillBtn} ${recording ? styles.recordingOnBtn : styles.recordingOffBtn}`}>
                {recordingBusy ? '…' : recording ? '■ Stop Recording' : '● Start Recording'}
              </button>
            )}
            <TrackToggle source={Track.Source.Microphone} showIcon disabled={!canSpeak} className={styles.controlBtn} />
            <TrackToggle source={Track.Source.Camera} showIcon disabled={!canSpeak} className={styles.controlBtn} />
            {!isHost && !canSpeak && (
              <button onClick={selfRaised ? lowerHand : raiseHand} className={`${styles.pillBtn} ${selfRaised ? styles.raiseHandBtnActive : styles.raiseHandBtn}`}>
                {selfRaised ? '✋ Hand raised' : '✋ Raise hand'}
              </button>
            )}
            {isHost ? (
              <button onClick={handleEndMeeting} disabled={ending} className={`${styles.pillBtn} ${styles.dangerBtn}`}>
                {ending ? 'Ending…' : 'End Meeting'}
              </button>
            ) : (
              <button onClick={() => router.push(backHref)} className={`${styles.pillBtn} ${styles.neutralBtn}`}>Leave</button>
            )}
          </div>
        </div>
        {recordingError && <p className={styles.recError}>{recordingError}</p>}

        <div className={styles.videoArea}>
          {isHost
            ? (selfTracks[0] && <ParticipantTile trackRef={selfTracks[0]} />)
            : (hostCameraTrack ? <ParticipantTile trackRef={hostCameraTrack} /> : <p className={styles.placeholderText}>Waiting for the host's video…</p>)
          }
        </div>
      </div>

      <aside className={styles.sidebar}>
        {isHost && (
          <section>
            <h3 className={styles.sectionHeading}>Raised hands ({raisedHands.size})</h3>
            {raisedHands.size === 0 && <p className={styles.emptyHint}>No one has raised a hand.</p>}
            <ul className={styles.list}>
              {Array.from(raisedHands.entries()).map(([identity, name]) => {
                const participant = remoteParticipants.find(p => p.identity === identity)
                const alreadyAllowed = !!participant?.permissions?.canPublish
                return (
                  <li key={identity} className={styles.listRow}>
                    <span className={styles.listRowName}>✋ {name}</span>
                    <button disabled={permissionBusy === identity || alreadyAllowed} onClick={() => setParticipantPermission(identity, true, false)}
                      className={`${styles.smallActionBtn} ${styles.allowBtn}`}>
                      {alreadyAllowed ? 'Allowed' : 'Allow mic'}
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <div className={styles.chatSection}>
          <h3 className={styles.sectionHeading}>Chat</h3>
          <div className={styles.chatMessages}>
            {messages.map((m, i) => <div key={i} className={styles.chatMessage}><span className={styles.chatMessageName}>{m.name}:</span> {m.text}</div>)}
          </div>
          <div className={styles.chatInputRow}>
            <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()}
              placeholder="Message everyone…" className={styles.chatInput} />
            <button onClick={handleSend} className={styles.chatSendBtn}>Send</button>
          </div>
        </div>
      </aside>
    </div>
  )
}
