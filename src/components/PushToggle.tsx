// src/components/PushToggle.tsx
// ─────────────────────────────────────────────────────────────────────────────
// Drop this into any dashboard's notification settings area or header.
// Shows a simple "Enable / Disable push notifications" button.
//
// Import example:
//   import PushToggle from '@/components/PushToggle'
//   <PushToggle />
// ─────────────────────────────────────────────────────────────────────────────
'use client'

import { usePushNotifications } from '@/hooks/usePushNotifications'

interface Props {
  /** Optional: render as a compact icon-only button */
  compact?: boolean
  /** Optional: class overrides for the outer wrapper */
  className?: string
}

export default function PushToggle({ compact = false, className = '' }: Props) {
  const { supported, subscribed, loading, permission, subscribe, unsubscribe, error }
    = usePushNotifications()

  // Nothing to render on desktop browsers that don't support Push
  if (!supported) return null

  if (loading) {
    return (
      <div className={`push-toggle push-toggle--loading ${className}`}>
        <span className="push-toggle__icon">🔔</span>
        {!compact && <span className="push-toggle__label">Checking…</span>}
      </div>
    )
  }

  if (permission === 'denied') {
    return (
      <div className={`push-toggle push-toggle--denied ${className}`} title="Notifications blocked in browser settings">
        <span className="push-toggle__icon">🔕</span>
        {!compact && <span className="push-toggle__label">Notifications blocked</span>}
      </div>
    )
  }

  return (
    <div className={`push-toggle ${className}`}>
      <button
        className={`push-toggle__btn ${subscribed ? 'push-toggle__btn--on' : 'push-toggle__btn--off'}`}
        onClick={subscribed ? unsubscribe : subscribe}
        disabled={loading}
        title={subscribed ? 'Disable push notifications' : 'Enable push notifications'}
      >
        <span className="push-toggle__icon">
          {subscribed ? '🔔' : '🔕'}
        </span>
        {!compact && (
          <span className="push-toggle__label">
            {subscribed ? 'Notifications On' : 'Enable Notifications'}
          </span>
        )}
      </button>

      {error && (
        <p className="push-toggle__error">{error}</p>
      )}

      <style>{`
        .push-toggle {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .push-toggle__btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 14px;
          border-radius: 10px;
          border: 1.5px solid var(--border, #2a2f3e);
          background: var(--card-bg, #131929);
          color: var(--text, #e2e8f0);
          font-size: 0.85rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .push-toggle__btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .push-toggle__btn--on {
          background: rgba(34, 197, 94, 0.12);
          border-color: rgba(34, 197, 94, 0.4);
          color: #4ade80;
        }
        .push-toggle__btn--off:hover {
          background: rgba(139, 92, 246, 0.12);
          border-color: rgba(139, 92, 246, 0.4);
        }
        .push-toggle__btn--on:hover {
          background: rgba(239, 68, 68, 0.12);
          border-color: rgba(239, 68, 68, 0.4);
          color: #f87171;
        }
        .push-toggle__icon {
          font-size: 1rem;
          line-height: 1;
        }
        .push-toggle__error {
          font-size: 0.75rem;
          color: #f87171;
          margin: 0;
          max-width: 240px;
        }
        .push-toggle--denied .push-toggle__icon,
        .push-toggle--loading .push-toggle__icon {
          font-size: 1rem;
        }
        .push-toggle--denied {
          opacity: 0.5;
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          color: var(--text-muted, #94a3b8);
        }
      `}</style>
    </div>
  )
}
