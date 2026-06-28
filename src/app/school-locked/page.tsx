// app/school-locked/page.tsx
'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'
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
}

function LockedContent() {
  const params   = useSearchParams()
  const status   = params.get('status') ?? 'locked'
  const info     = STATUS_MESSAGES[status] ?? STATUS_MESSAGES.locked
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #16213e 100%)',
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

        {/* SchoolOS brand */}
        <p style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.12em',
          textTransform: 'uppercase' as const,
          color: 'rgba(255,255,255,0.3)',
          margin: '0 0 12px',
        }}>
          SchoolOS
        </p>

        {/* Title */}
        <h1 style={{
          fontSize: '1.5rem',
          fontWeight: 800,
          color: '#fff',
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

        {/* WhatsApp CTA — uses PhoneIcon from Icons.tsx */}
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
