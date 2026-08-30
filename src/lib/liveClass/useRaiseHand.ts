'use client'
// src/lib/liveClass/useRaiseHand.ts
//
// Raise-hand state lives entirely on LiveKit's data channel — per the
// architecture requirement, this is NOT a Postgres table. A raised-hand
// list only needs to exist for the duration of the session and only for
// whoever is currently in the room; nothing about it needs to survive a
// page refresh mid-class (a refreshed student just lowers their hand and
// can raise it again), let alone survive after the session ends.
//
// Every client in the room maintains its own local view of "who has
// their hand raised" by listening to broadcast raise/lower events. The
// teacher's actual authorization action (turning a raised hand into real
// publish permission) still goes through the server — see
// /api/live/permission/route.ts — this hook only carries the UI signal.

import { useCallback, useState } from 'react'
import { useDataChannel, useLocalParticipant } from '@livekit/components-react'

const TOPIC = 'raise-hand'

type RaiseHandMessage =
  | { type: 'raise'; identity: string; name: string }
  | { type: 'lower'; identity: string }

export function useRaiseHand() {
  const { localParticipant } = useLocalParticipant()
  const [raisedHands, setRaisedHands] = useState<Map<string, string>>(new Map()) // identity -> display name
  const [selfRaised, setSelfRaised] = useState(false)

  const { send } = useDataChannel(TOPIC, (msg) => {
    try {
      const decoded = JSON.parse(new TextDecoder().decode(msg.payload)) as RaiseHandMessage
      setRaisedHands(prev => {
        const next = new Map(prev)
        if (decoded.type === 'raise') next.set(decoded.identity, decoded.name)
        else next.delete(decoded.identity)
        return next
      })
    } catch {
      // Malformed payload from a mismatched client version — ignore
      // rather than throw, since a bad raise-hand message must never
      // break the rest of the room's UI.
    }
  })

  const raiseHand = useCallback(async () => {
    const payload: RaiseHandMessage = {
      type: 'raise',
      identity: localParticipant.identity,
      name: localParticipant.name || localParticipant.identity,
    }
    setSelfRaised(true)
    setRaisedHands(prev => new Map(prev).set(payload.identity, payload.name))
    await send(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true })
  }, [localParticipant, send])

  const lowerHand = useCallback(async () => {
    const payload: RaiseHandMessage = { type: 'lower', identity: localParticipant.identity }
    setSelfRaised(false)
    setRaisedHands(prev => {
      const next = new Map(prev)
      next.delete(payload.identity)
      return next
    })
    await send(new TextEncoder().encode(JSON.stringify(payload)), { reliable: true })
  }, [localParticipant, send])

  return { raisedHands, selfRaised, raiseHand, lowerHand }
}
