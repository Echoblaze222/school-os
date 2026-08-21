// src/lib/fcm.ts
// ─────────────────────────────────────────────────────────────────────────────
// Server-only Firebase Cloud Messaging helper — the Android counterpart to
// lib/webpush.ts. Same shape on purpose: sendPushToUsers() in webpush.ts is
// the one place every notification in the app funnels through (see the
// comment at the top of that file and api/internal/push-on-notification),
// and it dispatches here for any subscription row with platform='android'.
//
// This app has no Firebase project configured yet (Lane 5 hasn't started
// in earnest), so exactly like ensureVapidConfigured(), this fails soft:
// if the service account env vars aren't set, sendFcmToTokens() resolves
// without throwing and without sending anything. Nothing in the rest of
// the app needs to know or care whether Android push is live yet.
//
// Requires the `firebase-admin` package (added to package.json) and three
// env vars once a Firebase project exists:
//   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
// (the three fields out of a Firebase service-account JSON key file).
// ─────────────────────────────────────────────────────────────────────────────

import type { App } from 'firebase-admin/app'

let app: App | null = null
let initTried = false

function ensureFirebaseApp(): App | null {
  if (app) return app
  if (initTried) return null
  initTried = true

  const projectId   = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey  = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !privateKey) {
    // Not configured yet — expected until a Firebase project is created,
    // see docs comment above. Not an error, just not wired up yet.
    return null
  }

  try {
    // Lazy require so this file (and firebase-admin) never gets pulled
    // into a bundle/runtime unless FCM is actually configured and used,
    // same reasoning as the module-boundary note at the top of webpush.ts.
    const { initializeApp, cert, getApps } = require('firebase-admin/app')
    const existing = getApps()
    app = existing.length
      ? existing[0]
      : initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            // Service-account JSON escapes newlines as \n; env vars store
            // that literally, so it has to be un-escaped here.
            privateKey: privateKey.replace(/\\n/g, '\n'),
          }),
        })
    return app
  } catch (err) {
    console.error('[fcm] failed to initialize firebase-admin:', err instanceof Error ? err.message : err)
    return null
  }
}

export interface FcmPayload {
  title: string
  body:  string
  url?:  string
  tag?:  string
}

/**
 * Send an FCM push to one or more device tokens. Returns the list of
 * tokens FCM reports as invalid/unregistered, so the caller can prune
 * those push_subscriptions rows — mirrors sendPushToUsers' handling of
 * 410/404 for Web Push.
 *
 * Safe to call even if Firebase isn't configured or the token list is
 * empty — resolves with an empty stale-token list in both cases.
 */
export async function sendFcmToTokens(tokens: string[], payload: FcmPayload): Promise<{ staleTokens: string[] }> {
  if (!tokens.length) return { staleTokens: [] }

  const firebaseApp = ensureFirebaseApp()
  if (!firebaseApp) return { staleTokens: [] }

  const { getMessaging } = require('firebase-admin/messaging')
  const messaging = getMessaging(firebaseApp)

  const message = {
    notification: { title: payload.title, body: payload.body },
    data: {
      url: payload.url ?? '/dashboard',
      tag: payload.tag ?? `schoolos-${Date.now()}`,
    },
    android: { priority: 'high' as const },
    tokens,
  }

  const staleTokens: string[] = []
  try {
    const response = await messaging.sendEachForMulticast(message)
    response.responses.forEach((r: any, i: number) => {
      if (!r.success) {
        const code = r.error?.code ?? ''
        if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
          staleTokens.push(tokens[i])
        }
      }
    })
  } catch (err) {
    console.error('[fcm] send error:', err instanceof Error ? err.message : err)
  }

  return { staleTokens }
}
