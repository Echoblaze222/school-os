# Phase 2, Lane B: Counselor Dashboard, delivery report

## Scope

Built the Counselor Dashboard against source spec Section 5 (Counselor
Dashboard), Section 26 (Counselor AI), and Section 27 (Counselor
notifications), on top of the Phase 1 foundation package already in this
repo (appointments/permission model, RLS baseline, rate-limit hotfix).

The Counselor is an appointment layered on the `teacher` base role, not a
base role itself (see `appointments-types.ts`). Every page and API route in
this module independently re-verifies an ACTIVE `counselor` appointment
server-side rather than trusting `profiles.role`, a hidden nav item, or
`middleware.ts` (whose role-segment enforcement only understands base
roles, and deliberately does not, and should not, list `counselor` — see
the comment at the top of `dashboard/counselor/page.tsx`).

## Two real vulnerabilities found and fixed while building this

1. **`api/ai/chat/route.ts` trusted a client-supplied `role` field to decide
   what live school data to inject into the AI's context.** Any
   authenticated user could send `role: "bursar"` or `role: "principal"` in
   the request body and receive school-wide financial/academic aggregates
   back, regardless of their real role. Found because I had to extend this
   exact function to add a Counselor branch, and Counselor was the one role
   where shipping this pattern unfixed would have been indefensible. Fixed
   by verifying the claimed role against the caller's real base role or an
   active appointment (`lib/permissions.ts: resolveVerifiedRole`) before
   trusting it for anything, with the caller's real base role used as the
   safe fallback on an unverifiable claim, not the raw client value.

2. **The security hotfix's `check_rate_limit()` RPC is `service_role`-only,
   granted to nobody else** (see `docs/security-hotfix`). My first draft of
   the referral-submission rate limit called it through the ordinary
   RLS-bound client and with the wrong parameter names
   (`p_action`/`p_max_attempts` instead of `p_scope`/`p_limit`), which would
   have failed with a permission/signature error in production the first
   time it ran. Caught by re-reading the hotfix SQL against my own call
   site before shipping; fixed to call it through the admin client with the
   correct signature.

## What "confidential by default" means here, concretely

- `counseling_cases`, `counseling_notes`, `counseling_sessions`, and
  `counseling_follow_ups` all have RLS that checks a live, active
  `counselor` appointment row for `auth.uid()` at the same school, not
  `profiles.role` and not school membership alone. A student, parent,
  teacher, prefect, ICT officer, warden, or Principal gets nothing from
  these tables by default.
- `counseling_notes` has no UPDATE or DELETE policy. Notes are append-only;
  a case's history can't be quietly edited after the fact.
- Referrals are the one deliberately open door: any authenticated
  same-school staff member or parent can submit one (rate-limited, 10/hour
  per user), but can only read back their *own* submission's status, never
  the resulting case or notes. The receiving counselor sees the reason text
  they wrote, nothing more is inferred or attached.
- Push/SMS/WhatsApp notification bodies for appointments and referrals are
  generic ("You have a counseling appointment on...", "A new referral is
  waiting...") and never include the reason, category, or risk level, so a
  lock-screen preview or a phone glanced at by someone else reveals nothing
  clinical.
- The Reports page returns aggregate counts only (by status, category, risk
  level), scoped to the counselor's own caseload; no student names or note
  content are ever included in that response.

## Screen-by-screen

| Screen | UX rating | What was built |
|---|---|---|
| Dashboard (overview) | New | Hero header, gauge stats (open/monitoring/pending referrals), AI insight banner that surfaces the single most urgent thing (overdue follow-ups > pending referrals > upcoming appointments > steady state), quick-access grid, recent activity feed. Skeleton-free by design (server-rendered stats, client only fetches the activity feed with a silent failure fallback so the page never blocks on it). |
| Caseload | New | Tab filter (open/monitoring/closed), risk-colored case cards, inline new-case form with debounced student search. Empty states per tab explain what will appear there. |
| Case detail | New | Risk-level toggle, status controls (open → monitoring → closed) with a danger-styled close action, pending follow-ups with one-tap "done," inline follow-up scheduling, linked appointment history, append-only confidential notes with a save-in-place list (no page reload). |
| Appointments | New | Upcoming/past tabs, inline scheduling form (student search, date/time, duration, location), per-appointment status actions (completed/no-show/cancel) that only show while still scheduled. |
| Referrals | New | Pending/Accepted/Declined tabs, urgency badges, accept (opens or reuses a case and jumps straight into it) and decline (with optional reason) actions, duplicate-submit protection via `ActionButton`'s built-in loading state. |
| Reports | New | Aggregate-only analytics: caseload summary, average days to close, appointment completion/no-show counts, cases by category, referral funnel. No row-level student data. |
| AI Assistant | New | Reused `UniversalAIPage` with a new Counselor persona and starter prompts; live caseload counts, next appointments, and follow-up status are injected server-side into its context, scoped to the caller exactly like every other read in this module. Explicitly instructed to keep case discussion to logistics, never clinical detail, and to never suggest sharing a case with another role. |
| Notifications | New | Reused the existing shared `NotificationsPageClient` pattern (same component every other role already runs), extended with icons for the two new notification types. |
| Profile | New | Reused the existing generic `ProfileClient` pattern, wired to the Counselor's own auth guard. |
| Messages | New | Reused the existing generic chat pages as-is; no counselor-specific change needed. |

## Motion and interaction

Reused the existing shared kit rather than inventing a parallel one, per
the master prompt's own instruction to build once and reuse
(`components/motion/{Skeleton,EmptyState,ActionButton,Toast}`,
`RoleHeroHeader`, `GaugeStat`, `BottomDock`, `AllFeaturesSheet`,
`RolePageWrapper`). Every list has a skeleton loading state, an empty
state that explains itself, and toast feedback with specific error text
(never a bare "Something went wrong") on every network call. Every
mutating button uses `ActionButton`, which disables itself and shows a
labeled loading state during the request, closing the double-submit gap
called out in the master prompt for exactly this kind of action.

## Files touched outside this module (all additive, reviewed line by line)

- `components/RoleNav.tsx`: added a `counselor` nav entry (sidebar +
  bottom dock). No existing entry changed.
- `components/Icons.tsx`: added `HeartIcon`. No existing icon changed.
- `components/UniversalAIPage.tsx`: added a `counselor` entry to the
  shared `ROLE_CONFIG` map. Without this, the AI page would have silently
  fallen back to the *student* study-help persona for the Counselor, which
  is the actual bug this fixes, not a cosmetic addition.
- `app/api/ai/chat/route.ts`: the role-verification fix above, plus a
  Counselor branch in the route map, persona, rate limit table, and data
  context, following the exact shape of every other role's branch.
- `middleware.ts`: deliberately **not** changed. Reasoning is documented
  as a comment in `dashboard/counselor/page.tsx`.

## Known, not fixed (out of this lane's scope, flagged for whoever owns it)

- `RolePageWrapper.tsx` and several other role layouts still fall back to
  a stale pre-brand violet (`#7C3AED`) when a school hasn't set
  `primary_color`. My new files fall back to the correct brand cyan
  (`#00B4D8`) instead, but I didn't touch the shared file itself since
  that's a cross-cutting fix, not a Lane B one.
- There's no UI yet for a teacher or parent to *submit* a referral (the
  API route and RLS fully support it). Adding that entry point lives
  naturally inside the Teacher and Parent dashboards, which are outside
  this lane; the referral queue, review, and conversion flow on the
  Counselor's side is complete and ready for it.
- No context-switcher exists yet for a teacher who also holds the
  Counselor appointment to move between the two dashboards. That component
  is owned by a different lane per the phase plan; until it ships, a
  counselor reaches their dashboard via the direct `/dashboard/counselor`
  URL, which is fully authorized on its own.
