'use client'
// src/app/splash/page.tsx
// "Signature Reveal" splash — same technique as the Trybe Focus reference:
// pen-stroke SVG text draw → chrome/gradient fill crossfade → shine sweep →
// glow pulse → wordmark steps back → second word slides out from behind it →
// tagline fades in → hold → cross-fade out. Re-colored to SchoolOS's own
// Violet × Gold tokens, re-worded to School / OS, no logo (Trybe has none).

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// SchoolOS's own tokens — not Trybe's blue/purple
const VIOLET        = '#7C3AED'
const VIOLET_SOFT    = 'rgba(124,58,237,0.14)'
const WHITE          = '#F5F3FF'   // "School" fill — soft white, not violet
const BG_DEEP        = '#060608'
const BG_PRIMARY     = '#0D0E16'
const TEXT_SECONDARY = '#8A94B8'

const DISPLAY_FONT = "'Inter', sans-serif"

type Stage = 'draw' | 'chrome' | 'shine' | 'glow' | 'shift' | 'tag' | 'out'

export default function SplashPage() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>('draw')
  const reducedMotion = useRef(
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  )
  const strokeTextRef = useRef<SVGTextElement>(null)
  const flourishRef   = useRef<SVGPathElement>(null)
  const [strokeLen, setStrokeLen]     = useState(420)
  const [flourishLen, setFlourishLen] = useState(160)

  const measure = useCallback(() => {
    if (strokeTextRef.current?.getComputedTextLength) {
      // A glyph's stroked outline is longer than its flat advance width —
      // 1.8x approximates the full pen-path length for a bold sans face.
      setStrokeLen(strokeTextRef.current.getComputedTextLength() * 1.8)
    }
    if (flourishRef.current?.getTotalLength) {
      setFlourishLen(flourishRef.current.getTotalLength())
    }
  }, [])

  useEffect(() => {
    measure()
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure)
    }
  }, [measure])

  useEffect(() => {
    if (reducedMotion.current) {
      const t = setTimeout(() => router.replace('/select-school'), 450)
      return () => clearTimeout(t)
    }
    const timers = [
      setTimeout(() => setStage('chrome'), 1750), // stroke finishes, crossfades to gradient fill + flourish draws
      setTimeout(() => setStage('shine'),  2150), // shine sweep passes across the letters
      setTimeout(() => setStage('glow'),   2650), // soft glow pulse breathes once
      setTimeout(() => setStage('shift'),  3000), // "School" steps back to make room
      setTimeout(() => setStage('tag'),    3100), // "OS" slides out from behind it
      setTimeout(() => setStage('out'),    4600), // hold, then cross-fade out
      setTimeout(() => router.replace('/select-school'), 5000),
    ]
    return () => timers.forEach(clearTimeout)
  }, [router])

  const reduced        = reducedMotion.current
  const drawing         = stage === 'draw' && !reduced
  const chromeVisible   = reduced || stage !== 'draw'
  const shifted         = reduced || (['shift', 'tag', 'out'] as Stage[]).includes(stage)
  const osVisible       = reduced || (['tag', 'out'] as Stage[]).includes(stage)

  return (
    <div
      style={{
        width: '100%', height: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        background: `linear-gradient(180deg, ${BG_DEEP} 0%, ${BG_PRIMARY} 100%)`,
        opacity: stage === 'out' ? 0 : 1,
        transition: 'opacity 300ms',
        position: 'fixed', inset: 0, overflow: 'hidden', zIndex: 9999,
      }}
    >
      <div style={{ position: 'relative', display: 'inline-block', zIndex: 2 }}>
        <svg width={280} height={92} viewBox="0 0 280 92" style={{ overflow: 'visible', position: 'relative', zIndex: 2 }}>
          <defs>
            <linearGradient id="schoolosChrome" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%"   stopColor={WHITE} />
              <stop offset="100%" stopColor="#FFFFFF" />
            </linearGradient>
            <linearGradient id="schoolosShine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor="#FFFFFF" stopOpacity="0" />
              <stop offset="50%"  stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
            </linearGradient>
            <mask id="schoolosTextMask">
              <rect x="0" y="0" width="280" height="92" fill="black" />
              <text x="42%" y="56" textAnchor="middle" style={{ fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 42, letterSpacing: 1 }} fill="white">
                School
              </text>
            </mask>
          </defs>

          {/* "School" — stroke draw, chrome fill, shine sweep — shifts left as a
              rigid unit once landed. The flourish below is NOT part of this
              group: it stays fixed the whole time. */}
          <g
            style={{
              transform: shifted ? 'translateX(-34px)' : 'translateX(0)',
              transition: reduced ? 'none' : 'transform 0.5s cubic-bezier(0.65,0,0.35,1)',
            }}
          >
            {/* Stroke layer — the actual pen line, measured and traced */}
            <text
              ref={strokeTextRef}
              x="42%" y="56" textAnchor="middle"
              style={{
                fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 42, letterSpacing: 1,
                fill: 'none', stroke: VIOLET, strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round',
                strokeDasharray: strokeLen,
                strokeDashoffset: drawing ? strokeLen : 0,
                transition: reduced ? 'none' : 'stroke-dashoffset 1.4s 0.15s cubic-bezier(0.5,0,0.4,1)',
                opacity: chromeVisible ? 0 : 1,
              } as React.CSSProperties}
            >
              School
            </text>

            {/* Gradient fill layer — crossfades in once the stroke completes */}
            <text
              x="42%" y="56" textAnchor="middle"
              style={{
                fontFamily: DISPLAY_FONT, fontWeight: 700, fontSize: 42, letterSpacing: 1,
                fill: 'url(#schoolosChrome)',
                opacity: chromeVisible ? 1 : 0,
                transition: 'opacity 0.4s',
                filter: stage === 'glow' ? `drop-shadow(0 0 18px ${VIOLET_SOFT})` : 'none',
                animation: stage === 'glow' && !reduced ? 'schoolosGlowPulse 0.9s ease-in-out' : 'none',
              } as React.CSSProperties}
            >
              School
            </text>

            {/* Shine sweep — moving highlight clipped to the letterforms via the mask above */}
            <rect
              x={(['shine', 'glow', 'out'] as Stage[]).includes(stage) ? 260 : -80}
              y="0" width="60" height="92"
              mask="url(#schoolosTextMask)"
              fill="url(#schoolosShine)"
              style={{ transition: reduced ? 'none' : 'x 0.45s cubic-bezier(0.3,0,0.2,1)' }}
            />
          </g>

          {/* Flourish — the hand-signed underline. Fixed in place at all times. */}
          <path
            ref={flourishRef}
            d="M28,70 C74,80 176,80 220,68"
            fill="none"
            stroke={VIOLET}
            strokeWidth={2}
            strokeLinecap="round"
            style={{
              strokeDasharray: flourishLen,
              strokeDashoffset: stage === 'draw' || reduced ? flourishLen : 0,
              transition: reduced ? 'none' : 'stroke-dashoffset 0.5s 0.05s cubic-bezier(0.4,0,0.2,1)',
              opacity: chromeVisible ? 1 : 0,
            }}
          />

          {/* "OS" — sits on the same baseline as "School", tucked behind its
              trailing edge, sliding out once "School" steps back. Reads as
              one wordmark, not a second line of type. */}
          <text
            x={178} y={56} textAnchor="start"
            style={{
              fontFamily: DISPLAY_FONT, fontWeight: 800, fontSize: 42, letterSpacing: 1,
              fill: VIOLET,
              opacity: osVisible ? 1 : 0,
              transform: osVisible ? 'translateX(0)' : 'translateX(-24px)',
              transition: reduced ? 'none' : 'transform 0.9s cubic-bezier(0.34,1.56,0.64,1), opacity 0.7s ease-out',
            } as React.CSSProperties}
          >
            OS
          </text>
        </svg>
      </div>

      <span
        style={{
          fontFamily: "'Inter', sans-serif", fontWeight: 500, fontSize: 12,
          color: TEXT_SECONDARY, marginTop: 10, letterSpacing: 2,
          opacity: stage === 'draw' ? 0 : 0.8,
          transition: 'opacity 0.4s 0.2s',
        }}
      >
        SCHOOL MANAGEMENT
      </span>

      <style>{`
        @keyframes schoolosGlowPulse {
          0%, 100% { filter: drop-shadow(0 0 6px ${VIOLET_SOFT}); }
          50%      { filter: drop-shadow(0 0 22px ${VIOLET_SOFT}); }
        }
      `}</style>
    </div>
  )
}
