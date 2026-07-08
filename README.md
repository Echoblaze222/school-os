# SchoolOS

Multi-tenant school management SaaS for Nigerian schools, built by Echoblaze.

SchoolOS gives every school its own tenant with six role-based portals — **Principal, Teacher, Bursar, Secretary, Student, Parent** — plus a platform-level **Super Admin** dashboard for onboarding, billing, and compliance across all schools.

---

## Tech Stack

| Layer            | Tech |
|-------------------|------|
| Framework         | Next.js (App Router, Turbopack) |
| Language          | TypeScript |
| Database / Auth   | Supabase (PostgreSQL, Auth, Storage, Row-Level Security) |
| Styling           | CSS Modules + CSS variables (no Tailwind) |
| Payments          | Paystack (subaccount split payments — 97% to school, 3% platform fee) |
| Email             | Resend |
| Push notifications| Web Push (VAPID) |
| Hosting           | Vercel |
| PWA               | Manifest + service worker (`public/manifest.json`, `public/sw.js`) |

---

## What's In This Repo

```
src/
├── app/
│   ├── login/                    Access-code + password login
│   ├── onboarding/stage-1..3/    3-stage onboarding (identity, password, NIN + docs)
│   ├── register-school/          Self-service school signup (Paystack registration)
│   ├── select-school/            Multi-school selector for shared accounts
│   ├── forgot-password/, reset-password/
│   ├── school-locked/            Shown when a school's subscription lapses
│   │
│   ├── dashboard/
│   │   ├── principal/            Students, staff, transfers, reports, school settings, banking/Paystack
│   │   ├── teacher/              Classes, attendance, gradebook
│   │   ├── bursar/               Invoices, fees, debtors, receipts, payment recording, reminders, export
│   │   ├── secretary/            Admin/records support
│   │   ├── student/              Grades, attendance, fees owed
│   │   └── parent/               Child(ren) overview, fee payments, attendance
│   │
│   │   Every role above also has an `ai/` route rendering the shared
│   │   `UniversalAIPage` — role-aware chat with persistent history, image
│   │   queries, and per-role rate limiting (see AI Assistant below).
│   │
│   ├── super-admin/              Platform-level dashboard (all schools)
│   │   ├── schools/              Full schools list (search/filter by status)
│   │   ├── school/[id]/          Per-school detail: overview, staff, payments, compliance, settings
│   │   ├── revenue/               Platform revenue view
│   │   └── settings/              Platform admin settings
│   │
│   ├── admin/                    School-level admin utilities
│   └── api/
│       ├── auth/, first-login/, onboarding/     Auth + onboarding endpoints
│       ├── principal/, bursar/, secretary/, parent/   Role-scoped actions
│       ├── super-admin/          create-school, manage-school (compliance, verification, locking)
│       ├── paystack/             create-subaccount (split payments), webhooks
│       ├── payments/, subscription/, trial/, currency/
│       ├── push/, notifications/  Web push subscriptions + delivery
│       ├── receipts/              PDF/receipt generation
│       ├── ai/, study-plan/       AI assistant — chat (`ai/chat`, with persisted history + image
│       │                          queries + rate limiting) and history (`ai/history`), plus study-plan
│       └── cron/                 Scheduled jobs (trial reminders, etc.)
│
├── hooks/
│   └── useVisualViewportHeight.ts  Tracks the true visible viewport height (mobile keyboard-aware);
│                                    used by full-height layouts like AI/Chat so a sticky input bar
│                                    stays pinned above the on-screen keyboard instead of scrolling off
│
├── lib/
│   ├── types.ts                  TypeScript types matching the DB schema
│   └── supabase/
│       ├── client.ts              Browser client
│       ├── server.ts              Server client (cookie-based, respects RLS)
│       ├── admin.ts               Service-role client — server-only, bypasses RLS
│       └── ai_upgrade.sql         Migration: image_url/model_used columns on ai_messages, a
│                                   one-live-conversation-per-role index, RLS, and the
│                                   ai_check_rate_limit() function used by /api/ai/chat
└── middleware.ts                  Route guard — enforces onboarding stages + role-based routing (incl. /super-admin)
```

---

## Core Concepts

### Roles & Multi-Tenancy
Every profile belongs to a `school_id` and a `role`. Middleware and RLS both enforce that a user can only reach their own role's dashboard and their own school's data — no authenticated user can browse another school's or another role's pages.

### Onboarding Flow
```
/login  (access code + temp password)
  ↓
/onboarding/stage-2   (identity confirmation + password change)
  ↓
/onboarding/stage-3   (NIN verification via Dojah + document upload)
  ↓
role dashboard
```
The `onboarding_stage` enum on the profile drives this; the middleware won't let a user skip ahead by URL.

### Billing: Platform Subscriptions vs. Student Fees
Two separate tables model two separate money flows:
- **`school_payments`** — the school's subscription/platform bill (trial → paid plan).
- **`fee_payments`** — student/parent fee payments collected *by* the school.

### Online Fee Payments (Paystack Split)
Schools never need their own Paystack account. A Paystack **subaccount** is created per school (`api/paystack/create-subaccount`), so each fee payment auto-splits: 97% settles directly to the school's bank account, 3% stays with the platform. Before a subaccount can be created, a super admin must mark the school **verified** in `school_compliance_records` — a one-time manual compliance check, gated in the API route.

### Super Admin
`/super-admin` — platform owner's view across all schools: subscription status, revenue, staff lists, compliance verification, and lock/unlock controls per school. Reached only by users present in `platform_admins`.

### AI Assistant
Every role's `ai/` page renders the same `UniversalAIPage` component (Claude, with a Gemini fallback on quota/overload):
- **Persistent history** — `/api/ai/chat` finds-or-creates one live `ai_conversations` row per `(user, role)` and appends real rows to `ai_messages` each turn; `/api/ai/history` restores it on page load, so a conversation follows the person across devices/logins, not just one browser's `localStorage` (which is still used as an instant-paint cache).
- **Image queries** — attach an image (5MB cap) alongside a question; it's sent to Claude as a vision content block (Gemini fallback gets it too via `inlineData`) and stored with the message so it reappears on reload.
- **Rate limiting** — `ai_check_rate_limit()` (a Postgres function, atomic across serverless instances) caps requests per user per minute — 20/min for student & parent, 30/min for staff roles — returning a 429 with a friendly message instead of erroring out under traffic spikes.
- **Migration** — run `lib/supabase/ai_upgrade.sql` once against your Supabase project before using any of the above; it's idempotent and safe to re-run.

---

## Setup Instructions

### 1. Install dependencies
```bash
npm install
```

### 2. Environment variables
Copy your Supabase project keys, plus service keys for the integrations below, into `.env.local`:
- Supabase URL + anon key + service role key
- `PAYSTACK_SECRET_KEY`
- Resend API key
- Web Push VAPID public/private keys
- Dojah API credentials (NIN verification)
- `ANTHROPIC_API_KEY` (AI assistant) and `GEMINI_API_KEY` (fallback)

### 3. Supabase setup
- Create the schema (profiles, schools, school_payments, fee_payments, school_compliance_records, notifications, push_subscriptions, etc.)
- Create **private** Storage buckets: `passports`, `nin-documents`
- Add RLS policies scoping each table to `school_id` / `auth.uid()` as appropriate
- Add a service-role-only policy for `school_compliance_records` and other platform-admin tables — accessed only via `lib/supabase/admin.ts` from server routes
- Run `lib/supabase/ai_upgrade.sql` (SQL editor or `psql`) — adds image/model columns to `ai_messages`, RLS on `ai_conversations`/`ai_messages`, and the `ai_check_rate_limit()` function the AI assistant depends on

### 4. Run the dev server
```bash
npm run dev
```
Visit `http://localhost:3000` — you'll land on `/login`.

---

## Notes for Contributors
- **Styling:** always use existing CSS variables (`var(--brand)`, `var(--glass-bg)`, `var(--text-primary)`, etc.) and wrap dashboard pages in `RolePageWrapper`. No Tailwind.
- **Auth:** use `getUser()`, not `getSession()`, in server components/routes — `getSession()` doesn't re-verify the JWT server-side.
- **Admin operations:** anything that needs to bypass RLS (super-admin actions, compliance checks) must go through `lib/supabase/admin.ts` inside a server route — never expose the service role key to the client.
- **Vercel builds:** avoid module-level side effects (e.g. initializing `web-push` VAPID keys at import time) — this breaks the build; initialize lazily inside the handler instead.
