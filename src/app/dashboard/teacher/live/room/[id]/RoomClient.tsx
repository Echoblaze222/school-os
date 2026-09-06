'use client'
// src/app/dashboard/teacher/live/room/[id]/RoomClient.tsx
//
// Teacher's live classroom view. Fetches a host token from the security
// boundary (/api/live/token), connects to LiveKit, and renders:
// self video, mute/camera controls, live participant count, a raised-
// hand queue, per-participant mic grant/revoke, and an explicit End
// Class action. No media ever routes through this Next.js app — this
// component only talks to Vercel for the token/permission/end API calls;
// everything audio/video-related goes directly to LiveKit.

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useParticipants,
  useLocalParticipant,
  useTracks,
  ParticipantTile,
  TrackToggle,
  ConnectionStateToast,
} from '@livekit/components-react'
import { Track } from 'livekit-client'
import '@livekit/components-styles'
import { useRaiseHand } from '@/lib/liveClass/useRaiseHand'
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
        if (!res.ok) throw new Error(data.error || 'Could not start this class.')
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

  if (loading) return <div className={styles.centerState}>Starting your class…</div>
  if (error) {
    return (
      <div className={styles.errorState}>
        <p className={styles.errorTitle}>Couldn't start this class</p>
        <p className={styles.errorBody}>{error}</p>
        <button onClick={() => router.push('/dashboard/teacher/live')} className={styles.errorLink}>
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
      video
      audio
      connect
      onDisconnected={() => router.push('/dashboard/teacher/live')}
      data-lk-theme="default"
      style={{ height: '100vh' }}
    >
      <TeacherRoomInner onlineClassId={onlineClassId} />
      <RoomAudioRenderer />
      <ConnectionStateToast />
    </LiveKitRoom>
  )
}

function TeacherRoomInner({ onlineClassId }: { onlineClassId: string }) {
  const router = useRouter()
  const participants = useParticipants()
  const { localParticipant } = useLocalParticipant()
  const { raisedHands } = useRaiseHand()
  const [ending, setEnding] = useState(false)
  const [permissionBusy, setPermissionBusy] = useState<string | null>(null)

  const selfTracks = useTracks(
    [{ source: Track.Source.Camera, withPlaceholder: true }],
    { onlySubscribed: false }
  ).filter(t => t.participant.isLocal)

  const handleEndClass = useCallback(async () => {
    if (!confirm('End this class for everyone?')) return
    setEnding(true)
    try {
      await fetch('/api/live/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ onlineClassId }),
      })
    } finally {
      router.push('/dashboard/teacher/live')
    }
  }, [onlineClassId, router])

  const setStudentPermission = useCallback(
    async (participantIdentity: string, canPublishAudio: boolean, canPublishVideo: boolean) => {
      setPermissionBusy(participantIdentity)
      try {
        await fetch('/api/live/permission', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ onlineClassId, participantIdentity, canPublishAudio, canPublishVideo }),
        })
      } finally {
        setPermissionBusy(null)
      }
    },
    [onlineClassId]
  )

  const remoteParticipants = participants.filter(p => !p.isLocal)

  return (
    <div className={styles.page}>
      <div className={styles.main}>
        <div className={styles.topBar}>
          <div className={styles.statusText}>
            {participants.length} in class · Recording: not enabled for this session
          </div>
          <div className={styles.controls}>
            <TrackToggle source={Track.Source.Microphone} showIcon className={styles.controlBtn} />
            <TrackToggle source={Track.Source.Camera} showIcon className={styles.controlBtn} />
            <button
              onClick={handleEndClass}
              disabled={ending}
              className={`${styles.pillBtn} ${styles.dangerBtn}`}
            >
              {ending ? 'Ending…' : 'End Class'}
            </button>
          </div>
        </div>

        <div className={styles.videoArea}>
          {selfTracks[0] && <ParticipantTile trackRef={selfTracks[0]} />}
        </div>
      </div>

      <aside className={styles.sidebar}>
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
                  <button
                    disabled={permissionBusy === identity || alreadyAllowed}
                    onClick={() => setStudentPermission(identity, true, false)}
                    className={`${styles.smallActionBtn} ${styles.allowBtn}`}
                  >
                    {alreadyAllowed ? 'Allowed' : 'Allow mic'}
                  </button>
                </li>
              )
            })}
          </ul>
        </section>

        <section>
          <h3 className={styles.sectionHeading}>Participants ({remoteParticipants.length})</h3>
          <ul className={styles.list}>
            {remoteParticipants.map(p => {
              const canSpeak = !!p.permissions?.canPublish
              return (
                <li key={p.identity} className={styles.listRow}>
                  <span className={styles.listRowName}>{p.name || p.identity}</span>
                  {canSpeak ? (
                    <button
                      disabled={permissionBusy === p.identity}
                      onClick={() => setStudentPermission(p.identity, false, false)}
                      className={`${styles.smallActionBtn} ${styles.revokeBtn}`}
                    >
                      Revoke
                    </button>
                  ) : (
                    <span className={styles.listeningTag}>Listening</span>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      </aside>
    </div>
  )
}
