# SchoolOS Auth — Integration Guide

## Files Overview

```
src/
├── middleware.ts                          ← ROUTE PROTECTION + AUTO-LOGOUT (server)
├── lib/
│   └── useAutoLock.ts                     ← CLIENT-SIDE INACTIVITY TRACKER (locks, doesn't sign out)
├── components/
│   └── auth/
│       ├── LockScreen.tsx                  ← Password re-entry screen shown while locked
│       ├── LockScreen.module.css
│       ├── TimeoutBanner.tsx               ← Shows "logged out due to inactivity" banner
│       └── TimeoutBanner.module.css
└── app/
    ├── splash/                           ← STEP 0: Logo animation (2.8s) → /select-school
    │   ├── page.tsx
    │   └── splash.module.css
    ├── select-school/                    ← STEP 1: Pick your school
    │   ├── page.tsx
    │   └── select-school.module.css
    ├── login/                            ← STEP 2: Login + Register (merged tabs)
    │   ├── page.tsx
    │   └── login.module.css
    ├── forgot-password/                  ← Redesigned forgot password
    │   ├── page.tsx
    │   └── forgot-password.module.css
    ├── reset-password/                   ← Redesigned reset password (with strength meter)
    │   ├── page.tsx
    │   └── reset-password.module.css
    └── dashboard/
        ├── layout.tsx                     ← Wraps dashboard with useAutoLock + <LockScreen>
        └── dashboard-layout.module.css
```

---

## 1. Install dependencies

```bash
npm install @supabase/ssr @supabase/supabase-js
```

---

## 2. Copy files into your project

Drop all these files into the exact same paths in your Next.js app.

---

## 3. Update your dashboard layout

Open `src/app/dashboard/layout.tsx` (or wherever your dashboard `layout.tsx` is).
Wrap the children with `DashboardLayout`:

```tsx
// src/app/dashboard/layout.tsx
import DashboardLayout from './dashboard-layout'

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    // Your existing sidebar/nav wrapper here...
    <DashboardLayout>
      {children}
    </DashboardLayout>
  )
}
```

> Do the same for any other private layouts (principal/, teacher/, bursar/, etc.)

---

## 4. Add Orbitron font (splash + headers)

In `src/app/layout.tsx`, add:

```tsx
import { Orbitron, Inter } from 'next/font/google'

const orbitron = Orbitron({ subsets: ['latin'], variable: '--font-orbitron' })
const inter    = Inter({ subsets: ['latin'], variable: '--font-inter' })

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${orbitron.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  )
}
```

Then in CSS use: `font-family: var(--font-orbitron)` or just `'Orbitron'`.

---

## 5. Add TimeoutBanner to your login page

In `src/app/login/page.tsx`, add near the top of the form:

```tsx
import { Suspense } from 'react'
import TimeoutBanner from '@/components/auth/TimeoutBanner'

// Inside the JSX, before the tab switcher:
<Suspense fallback={null}>
  <TimeoutBanner />
</Suspense>
```

---

## 6. Root redirect

The middleware already handles `/` → `/splash` for unauthenticated users and
`/` → `/dashboard` for authenticated users. Make sure your root `page.tsx` is
either empty or just `return null`.

---

## 7. Inactivity settings

| File | Constant |
|------|----------|
| `src/middleware.ts` | `INACTIVITY_MINUTES = 30` (hard sign-out, server-side fallback) |
| `profiles.auto_lock_enabled` / `profiles.auto_lock_minutes` | Per-user lock preference, editable via `<AutoLockSettings/>` in each role's Settings page. Defaults: enabled, 10 minutes. |

---

## 8. How inactivity handling works (two layers)

### Layer 1 — Middleware (server-side, hard sign-out)
- On every page navigation, reads `schoolos_last_activity` cookie
- If > 30 min since last activity → signs out + redirects to `/login?reason=timeout`
- Sets/refreshes the cookie on every request
- This is a coarse, request-cadence-based fallback - it only notices inactivity between navigations, not while someone is sitting on one page

### Layer 2 — `useAutoLock` hook (client-side, locks without signing out)
- Listens for: `mousemove`, `mousedown`, `keydown`, `touchstart`, `touchmove`, `scroll`, `wheel`, `click`
- After the user's own configured number of idle minutes (`profiles.auto_lock_minutes`, default 10) → shows `<LockScreen>` instead of signing out - the Supabase session stays valid so push notifications and background sync keep working
- Uses `localStorage`, not a timer alone, so it also catches the case where the OS killed the app process while backgrounded and it's later relaunched
- `LockScreen` requires the account's password to resume; 5 wrong attempts trigger a real sign-out via `signOutFlow.ts`

Both layers together ensure something happens whether the user is:
- Navigating between pages while genuinely away a long time (middleware catches it)
- Sitting on one page doing nothing (the hook catches it first, well before the 30-minute middleware fallback)
- Left the tab open in the background (the hook's visibility handler catches it)

---

## 9. User flow

```
App opens
   ↓
/splash  (2.8s logo animation)
   ↓
/select-school  (search + pick school)
   ↓
/login  (Sign In tab)
   ├── Email + Password → /dashboard
   └── Access Code → /onboarding/...
   
   OR

/login  (Register School tab)
   ├── Step 1: School info
   └── Step 2: Principal info → Paystack payment → /dashboard
   
Forgot password?
   /forgot-password → email sent → /reset-password → /login
```

---

## 10. Turning it into a real app (PWA)

Your `public/` folder already has everything needed:
- `manifest.json` → makes it installable
- `sw.js` → service worker for offline support
- All icon sizes (72–512px)

**To install on Android/iOS:**
1. Open the app in Chrome/Safari
2. Tap the share/menu button
3. "Add to Home Screen"

It will open in standalone mode (no browser chrome) just like a native app.

**To make it a proper native app**, use:
- **Capacitor** (recommended): `npm install @capacitor/core @capacitor/cli && npx cap init`
  Then wrap your Next.js output and deploy to Play Store / App Store
- **React Native + Expo** if you want to rebuild the UI natively

For Nigerian schools, **PWA is usually enough** — it works on slow networks via the service worker,
and users can install it from Chrome without needing the Play Store.
