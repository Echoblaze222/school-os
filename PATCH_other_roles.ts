// ─────────────────────────────────────────────────────────────────────────────
// PATCH: Add Push Toggle to Student / Teacher / Parent / Bursar / Secretary
//        NotificationsPageClient.tsx files
//
// These all share an identical structure. Make 3 small changes:
// ─────────────────────────────────────────────────────────────────────────────

// ── Change 1: Add import at the top ──────────────────────────────────────────
//
// BEFORE:
//   import { useState, useEffect, useCallback } from 'react'
//
// AFTER:
//   import { useState, useEffect, useCallback } from 'react'
//   import { usePushNotifications } from '@/hooks/usePushNotifications'


// ── Change 2: Instantiate the hook inside the component ─────────────────────
//
// BEFORE (after the existing useState declarations):
//   const dashboardPath = ROLE_DASHBOARDS[role] ?? '/dashboard/student'
//
// AFTER:
//   const push = usePushNotifications()
//   const dashboardPath = ROLE_DASHBOARDS[role] ?? '/dashboard/student'


// ── Change 3: Add the push button in the header's headerRight div ────────────
//
// BEFORE:
//   <div className={styles.headerRight}>
//     <button className={styles.iconBtn} onClick={() => { ... }}>
//       {theme === 'dark' ? '☀️' : '🌙'}
//     </button>
//     {localUnread > 0 && (
//       <button className={styles.markAllBtn} onClick={markAllRead}>
//         ✓ All read
//       </button>
//     )}
//   </div>
//
// AFTER (add the PushBtn block between the theme toggle and the mark-all button):
//
//   <div className={styles.headerRight}>
//     <button className={styles.iconBtn} onClick={() => { ... }}>
//       {theme === 'dark' ? '☀️' : '🌙'}
//     </button>
//
//     {/* ── Push toggle ── */}
//     {push.supported && !push.loading && push.permission !== 'denied' && (
//       <button
//         className={styles.markAllBtn}
//         style={{
//           background:  push.subscribed ? 'rgba(34,197,94,0.15)' : 'var(--card-bg)',
//           color:       push.subscribed ? '#4ade80' : 'var(--text)',
//           borderColor: push.subscribed ? 'rgba(34,197,94,0.4)' : 'var(--border)',
//         }}
//         onClick={push.subscribed ? push.unsubscribe : push.subscribe}
//         title={push.subscribed ? 'Disable push alerts' : 'Enable push alerts on this device'}
//       >
//         {push.subscribed ? '🔔 On' : '🔕 Alerts'}
//       </button>
//     )}
//
//     {localUnread > 0 && (
//       <button className={styles.markAllBtn} onClick={markAllRead}>
//         ✓ All read
//       </button>
//     )}
//   </div>

// ── That's it. The hook handles everything else automatically. ────────────────
//
// Summary of what changes per role:
//   student   → NotificationsPageClient.tsx in dashboard/student/notifications/
//   teacher   → NotificationsPageClient.tsx in dashboard/teacher/notifications/
//   parent    → NotificationsPageClient.tsx in dashboard/parent/notifications/
//   bursar    → NotificationsPageClient.tsx in dashboard/bursar/notifications/
//   secretary → NotificationsPageClient.tsx in dashboard/secretary/notifications/
//
// The principal version is fully rewritten in NotificationsPageClient_principal_updated.tsx
