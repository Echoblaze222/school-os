// app/school-locked/page.tsx
'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { signOutFlow } from '@/lib/signOutFlow'
import { PhoneIcon } from '@/components/Icons'

const STATUS_MESSAGES: Record<string, { title: string; body: string; icon: string }> = {
  locked: {
    icon:  '🔒',
    title: 'Portal Temporarily Locked',
    body:  'Your school portal has been locked by the administrator. This is usually due to an outstanding subscription payment. Please contact your school principal or reach out to SchoolOS support.',
  },
  expired: {
    icon:  '⏰',
    title: 'Subscription Expired',
    body:  "Your school's subscription has expired. The portal will be restored as soon as payment is confirmed. Please contact your principal.",
  },
  suspended: {
    icon:  '⏸',
    title: 'Account Suspended',
    body:  'Your school account has been suspended. Please contact SchoolOS support for assistance.',
  },
  // Was previously missing entirely, so a cancelled school fell through to
  // the generic 'locked' copy above ("usually due to an outstanding
  // payment") - actively wrong for a school that explicitly chose not to
  // renew. setup_status can be 'cancelled' per checkSubscription() /
  // middleware.ts's billingLocked set
  // (docs/lane2-subscription-billing-payment-enforcement/00-README.md
  // documents this distinct copy as intended - it just was never actually
  // added here). SubscriptionGate.tsx had the same gap; fixed there too.
  cancelled: {
    icon:  '🚫',
    title: 'Subscription Cancelled',
    body:  'Your school chose not to renew its SchoolOS subscription. Please contact your school principal if you believe this is a mistake, or to arrange renewal.',
  },
}

// SchoolOS's own maroon - used only until/unless the school's own color is
// available (see loadSchoolBrand below).
const DEFAULT_ACCENT = '#800020'

interface StoredSchool {
  id?: string
  name?: string | null
  primaryColor?: string | null
  logoUrl?: string | null
}

// Reads the same 'schoolos_selected_school' localStorage key that
// /select-school, /login, and signOutFlow.ts already write on every login -
// by the time anyone can reach this locked page they've necessarily been
// through one of those, so this is reliably present, synchronous (no
// loading flash), and requires no extra network round trip or RLS query.
// This was the actual bug: this page never read it at all and instead
// hardcoded SchoolOS's own theme regardless of which school's portal was
// locked - the properly-branded equivalent (SubscriptionGate.tsx) exists
// elsewhere in the codebase but is unreachable here because middleware.ts
// redirects to this route before a dashboard page (where SubscriptionGate
// lives) ever renders. See the PR description for the full trace.
function loadStoredSchool(): StoredSchool {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem('schoolos_selected_school')
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return {
      id: parsed?.id,
      name: typeof parsed?.name === 'string' ? parsed.name : null,
      primaryColor: typeof parsed?.primaryColor === 'string' ? parsed.primaryColor : null,
      logoUrl: typeof parsed?.logoUrl === 'string' ? parsed.logoUrl : null,
    }
  } catch {
    return {}
  }
}

// Converts a '#rrggbb' hex color to an 'rgba(r,g,b,a)' string for the
// radial-gradient background below. Falls back to the default accent's
// own tint if the stored value isn't valid 6-digit hex - principal
// settings already validates on save (see /api/principal/settings), but
// this stays defensive since it's rendering client-stored data.
function hexToRgba(hex: string, alpha: number): string {
  const match = /^#?([0-9a-fA-F]{6})$/.exec(hex)
  if (!match) return `rgba(128,0,32,${alpha})`
  const int = parseInt(match[1], 16)
  const r = (int >> 16) & 255
  const g = (int >> 8) & 255
  const b = int & 255
  return `rgba(${r},${g},${b},${alpha})`
}

function LockedContent() {
  const params   = useSearchParams()
  const status   = params.get('status') ?? 'locked'
  const info     = STATUS_MESSAGES[status] ?? STATUS_MESSAGES.locked
  const supabase = createClient()

  // Lazy initializer runs once, synchronously, on mount - no fetch, no
  // flash of the wrong color before the real one loads.
  const [brand] = useState<StoredSchool>(loadStoredSchool)
  const accent = brand.primaryColor || DEFAULT_ACCENT

  async function handleSignOut() {
    await signOutFlow(supabase, {
      push: (href: string) => { window.location.href = href },
    })
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: `radial-gradient(ellipse at 50% 20%, ${hexToRgba(accent, 0.16)} 0%, #080C14 55%, #060608 100%)`,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'DM Sans, Inter, sans-serif',
      padding: '24px',
    }}>
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24,
        padding: '48px 40px',
        maxWidth: 480,
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 32px 80px rgba(0,0,0,0.4)',
      }}>
        {/* Status emoji */}
        <div style={{ fontSize: 64, marginBottom: 24 }}>{info.icon}</div>

        {/* School name - falls back to the SchoolOS wordmark only if
            nothing was ever stored (shouldn't happen given the trace
            above, but this page must never crash for a locked-out user) */}
        <p style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.3)',
          margin: '0 0 12px',
        }}>
          {brand.name || 'SchoolOS'}
        </p>

        {/* Title - now colored with the school's own brand color, matching
            the same treatment SubscriptionGate.tsx already gives its
            heading/divider/button */}
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 800,
          color: accent,
          margin: '0 0 16px',
          lineHeight: 1.3,
        }}>
          {info.title}
        </h1>

        {/* Body */}
        <p style={{
          fontSize: '0.88rem',
          color: 'rgba(255,255,255,0.55)',
          lineHeight: 1.7,
          margin: '0 0 32px',
        }}>
          {info.body}
        </p>

        {/* Accent divider - matches SubscriptionGate.tsx's use of
            schoolColor for this same element */}
        <div style={{ height: 2, width: 48, background: accent, margin: '0 auto 32px', borderRadius: 2 }} />

        {/* WhatsApp CTA - kept WhatsApp's own green regardless of school
            color. This is a recognizable third-party action button, not
            part of the school's own branding - same reasoning
            SubscriptionGate.tsx applies to its phone-number pill. */}
        <a
          href="https://wa.me/2348086883144?text=Hello%2C%20my%20school%20portal%20has%20been%20locked.%20Please%20help%20me%20restore%20access."
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            padding: '14px 20px',
            background: '#25D366',
            borderRadius: 12,
            color: '#fff',
            fontSize: '0.92rem',
            fontWeight: 700,
            textDecoration: 'none',
            marginBottom: 12,
            boxSizing: 'border-box' as const,
          }}
        >
          <PhoneIcon size={18} color="#fff" strokeWidth={2.2} />
          Contact Support on WhatsApp
        </a>

        {/* Phone number pill */}
        <div style={{
          background: 'rgba(37,211,102,0.07)',
          border: '1px solid rgba(37,211,102,0.18)',
          borderRadius: 10,
          padding: '10px 16px',
          marginBottom: 24,
        }}>
          <p style={{
            fontSize: '0.92rem',
            fontWeight: 700,
            color: 'rgba(255,255,255,0.8)',
            margin: 0,
            letterSpacing: '0.04em',
          }}>
            +234 808 688 3144
          </p>
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          style={{
            width: '100%',
            height: 46,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 12,
            color: 'rgba(255,255,255,0.5)',
            fontSize: '0.88rem',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  )
}

export default function SchoolLockedPage() {
  return (
    <Suspense>
      <LockedContent />
    </Suspense>
  )
}
