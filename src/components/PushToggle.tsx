// src/components/PushToggle.tsx
// ─────────────────────────────────────────────────────────────────────────────
// A working "Enable / Disable push notifications" button, not currently
// mounted anywhere in the app.
//
// It briefly was - RoleHeroHeader.tsx mounted it in `compact` mode next to
// the real NotificationsBell, which put two different bell icons side by
// side for two unrelated things (NotificationsBell = your notification
// list; this = a device-level push-permission toggle) - confusing on its
// own, made worse by this component's `compact` mode rendering a raw 🔔/🔕
// emoji in a self-styled inline <style> block instead of the app's actual
// icon system (BellIcon, .iconBtn, CSS custom properties) that everything
// else in that header uses. Removed from RoleHeroHeader for that reason.
//
// There is currently no UI anywhere in the app for a user to opt into push
// notifications at all - this component still works (the underlying
// usePushNotifications hook is correct, Android and web alike), it just
// needs a real home. The most natural one is a "Notifications" section on
// each role's Settings page, which doesn't exist yet either - none of the
// 13 roles' settings pages have a notification-preferences section, even
// though the notification_preferences table this would eventually feed
// into (docs/lane3-notifications) already exists in the schema. That's
// real, separate, not-small scope (13 settings pages, decisions about what
// preferences to expose) - flagging it here rather than building it as a
// side effect of removing a broken header icon.
//
// Import example once it has a real home:
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
