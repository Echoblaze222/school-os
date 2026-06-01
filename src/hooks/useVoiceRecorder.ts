// hooks/useVoiceRecorder.ts
'use client'

import { useState, useRef, useCallback } from 'react'

export type RecordingState = 'idle' | 'recording' | 'paused' | 'stopped'

export interface VoiceRecorderResult {
  state:         RecordingState
  duration:      number          // seconds
  audioBlob:     Blob | null
  audioUrl:      string | null
  startRecording: () => Promise<void>
  stopRecording:  () => void
  cancelRecording:() => void
  resetRecording: () => void
  error:         string | null
}

export function useVoiceRecorder(maxDurationSeconds = 120): VoiceRecorderResult {
  const [state,     setState]     = useState<RecordingState>('idle')
  const [duration,  setDuration]  = useState(0)
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null)
  const [audioUrl,  setAudioUrl]  = useState<string | null>(null)
  const [error,     setError]     = useState<string | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef        = useRef<Blob[]>([])
  const timerRef         = useRef<NodeJS.Timeout | null>(null)
  const streamRef        = useRef<MediaStream | null>(null)
  const startTimeRef     = useRef<number>(0)

  // ── Start recording ───────────────────────────────────────
  const startRecording = useCallback(async () => {
    try {
      setError(null)
      chunksRef.current = []

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      // Pick best supported MIME type
      const mimeType = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
      ].find(t => MediaRecorder.isTypeSupported(t)) ?? ''

      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' })
        const url  = URL.createObjectURL(blob)
        setAudioBlob(blob)
        setAudioUrl(url)
        setState('stopped')
        stopStream()
      }

      recorder.start(100) // collect data every 100ms
      startTimeRef.current = Date.now()
      setState('recording')
      setDuration(0)

      // Update duration every second
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000)
        setDuration(elapsed)

        // Auto-stop at max duration
        if (elapsed >= maxDurationSeconds) {
          stopRecording()
        }
      }, 1000)

    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        setError('Microphone permission denied. Please allow microphone access.')
      } else if (err.name === 'NotFoundError') {
        setError('No microphone found on this device.')
      } else {
        setError('Could not start recording. Please try again.')
      }
    }
  }, [maxDurationSeconds])

  // ── Stop recording ────────────────────────────────────────
  const stopRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }, [])

  // ── Cancel recording ──────────────────────────────────────
  const cancelRecording = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      // Remove onstop so blob is not saved
      mediaRecorderRef.current.onstop = null
      mediaRecorderRef.current.stop()
    }
    stopStream()
    chunksRef.current = []
    setState('idle')
    setDuration(0)
    setAudioBlob(null)
    setAudioUrl(null)
  }, [])

  // ── Reset ─────────────────────────────────────────────────
  const resetRecording = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl)
    setState('idle')
    setDuration(0)
    setAudioBlob(null)
    setAudioUrl(null)
    setError(null)
    chunksRef.current = []
  }, [audioUrl])

  // ── Stop media stream ─────────────────────────────────────
  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }, [])

  return {
    state, duration, audioBlob, audioUrl,
    startRecording, stopRecording, cancelRecording, resetRecording,
    error,
  }
}

// ── Format duration mm:ss ─────────────────────────────────────
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}
