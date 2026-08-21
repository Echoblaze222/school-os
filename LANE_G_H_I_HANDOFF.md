# Lane G, H, I Handoff (Phase 4 - Public Platform)

Built originally against the merged Lane C/D + Lane E/F codebase, before
Lane A/B had landed. Lane A/B has since landed and been reconciled - see
"Lane A/B reconciliation" below for what changed as a result, including
one retired duplicate system. The "What shipped" section below describes
the current, post-reconciliation state, not the original delivery.

## What shipped

**Lane G - Verification + fraud/safety protection + moderation (§51, 52, 62)**
- Public-facing school verification badge: `schools.verified_status`
  (3-state), owned by and adopted from Lane B - see "Lane A/B
  reconciliation" below for why Lane G's own original 5-state
  `verification_status` column was retired in its favor. Distinct from
  the pre-existing `school_compliance_records.is_verified`, which gates
  Paystack payouts and is never shown publicly - the two are not the
  same thing and neither lane touches the compliance one.
- Managed from the existing super-admin School Detail page, via a
  `set_verified_status` action on the existing
  `/api/super-admin/manage-school` route (Lane B's addition, adopted
  wholesale rather than duplicated).
- `VerificationBadge` component (Lane G, rewritten for Lane B's 3-state
  model), wired into `/find-school` (Lane C) and `/schools/[slug]`
  (Lane B, wired in by Lane B itself).

- Magic-byte file signature validation added to the admission document
  upload route - previously the declared `mimeType` was trusted with no
  check against actual bytes. See `PUBLIC_PLATFORM_SECURITY_REVIEW.md`
  item 13.
- `content_reports` - generic public reporting/takedown queue (school
  profiles, promotions, content posts, admission applications), no
  account required to file one. Super-admin review queue at
  `/super-admin/reports`. Reusable `ReportContentButton` component, wired
  into `/find-school` cards and blog posts.

**Lane H - Public content/blog (§54, 55)**
- `content_posts` table, Draft → Review → Scheduled → Published →
  Archived workflow.
- Public read at `/blog` and `/blog/[slug]` (reuses Lane C's `(public)`
  route group shell rather than building a second header/layout).
- Super-admin management at `/super-admin/content` (list + filter) and
  `/super-admin/content/[id]` (single editor for both create and edit).
- Every row is necessarily official SchoolOS content by construction -
  there is no school-authored-content write path in this pass, so §55's
  "must remain clearly distinguishable" requirement is trivially met
  rather than actively enforced. If a school-submitted content type is
  added later, it needs its own `is_official` flag and a visibly
  different badge - flagging this now rather than guessing at a design
  for a feature that doesn't exist yet.

**Lane I - Public platform performance + security hardening (§63, 64)**
- Rate limiting (reusing the existing `check_rate_limit()` Postgres
  function, not a new mechanism) added to every public GET endpoint that
  didn't already have it: school search, promotions, rankings, content.
- Cache-Control headers added to the same endpoints so a discovery-
  traffic spike hits the CDN, not the DB or school operational
  dashboards - directly implements §63's "Caching / CDN" step.
- `PUBLIC_PLATFORM_SECURITY_REVIEW.md` - full §64 checklist walked
  against actual code/RLS, not just asserted. Two items (promotion
  privilege escalation, ranking manipulation) are explicitly left to
  Lane E/F's own review rather than re-verified here, per "don't touch
  another lane's folder."

## Lane A/B reconciliation (done after A/B landed)

Lane A/B's delivery arrived after the section above was originally
written, as a "known gaps" list. Reconciling against it surfaced one real
duplicate-system conflict and a couple of gaps in A/B's own delivery that
had nothing to do with verification:

**Verification: retired Lane G's `verification_status`, adopted Lane B's
`verified_status`.** Both lanes independently built a public-facing
school verification badge - Lane G shipped `schools.verification_status`
(5-state, RLS-omission-protected), Lane B shipped `schools.verified_status`
(3-state, protected by the `prevent_school_protected_field_update`
database trigger - stronger, since it defends even against a future bug
that grants principals broader `schools` write access). Lane B's version
was adopted as canonical and Lane G's was fully retired:
- `sql/lane-g-h-i-verification-content-security.sql` no longer adds
  `verification_status` or `school_verification_events` - replaced with a
  note explaining the retirement and a documented (unneeded, per this
  handoff) rollback if the old migration was ever run live.
- `/api/super-admin/manage-school/route.ts` and
  `SchoolDetailClient.tsx` - Lane B's versions adopted wholesale (both
  are supersets of the pre-Lane-G base once Lane G's own addition is
  dropped, so nothing is lost).
- `VerificationBadge.tsx` - rewritten for the 3-state model, now reads
  `verified_status`.
- `/api/admission/schools/route.ts` and `FindSchoolClient.tsx` (Lane C) -
  updated to read `verified_status` instead of the retired column.
- `ProfileClient.tsx` (Lane B's new `/schools/[slug]` public profile
  page) - `VerificationBadge` was already wired in by Lane B itself;
  `ReportContentButton` added here, closing the "known gap" the previous
  version of this doc flagged.

**Gaps found in Lane A/B's own delivery, fixed here rather than sent
back**, since they were small and this reconciliation pass was already
touching the relevant files:
- Lane A/B included no `middleware.ts` changes. `/find-schools`,
  `/schools`, `/api/public/schools`, and `/api/public/stats` were all
  missing from `PUBLIC_PATHS` - every one of them would have
  force-redirected an unauthenticated visitor to `/login`, including
  every link on the new landing page. Added.
- The existing root-path handler in `middleware.ts` unconditionally
  redirected `/` to `/splash` for signed-out visitors - would have made
  Lane A's new landing page (`src/app/page.tsx`) completely unreachable.
  Fixed to let the landing page render; `/splash` still exists and is
  reached from the landing page's own login CTA.
- `/api/public/schools` and `/api/public/schools/[slug]` had no rate
  limiting or caching, unlike their own sibling
  `/api/public/schools/[slug]/inquiries` (which already had strong
  anti-abuse protection) and every other public read endpoint on the
  platform. Added, matching the existing `checkRateLimit()` pattern.
  `/api/public/stats` given caching only (see that route's own comment
  for why no rate limit was added there).

**Confirmed NOT a conflict, left untouched**, after checking: several
dashboard files (meeting-card prop shapes, button className cleanup,
`dashboard/page.tsx`, `dashboard/secretary/page.tsx`) showed up as
diffs against Lane A/B's copies, but turned out to be either the same
fix three lanes converged on independently, or cases where the current
merged tree was already a strict superset of Lane A/B's copy - most
notably `dashboard/secretary/page.tsx`, where Lane A/B's version still
queries the legacy `admissions` table that Lane D explicitly retired in
favor of `admission_applications`. Full checklist run recorded in
`PUBLIC_PLATFORM_SECURITY_REVIEW.md`.

**Product-level open question, not an engineering one:** `admission_status`
and `application_deadline` now exist directly on `schools` (Lane B, for
the public profile's "accepting applications" display) alongside Lane
C/D's much richer `admission_settings` + `admission_applications` system
that actually drives `/apply`. These appear to serve different purposes
by design (a simple public display flag vs. the operational admission
funnel) rather than being a duplicate - Lane B's public profile links
through to Lane C's real `/apply/[schoolId]` flow rather than building
its own. Worth a product-level confirmation that these two are meant to
stay separate and don't need syncing (e.g. a school could in principle
set `admission_status = 'open'` while `admission_settings.is_enabled =
false`, showing conflicting signals) - flagging rather than guessing at
a fix for a discrepancy that may be intentional.

## Files touched outside this lane's own new files

- `src/middleware.ts` - `/blog` and `/api/public` (Lane H/E-F), plus
  `/find-schools`, `/schools` (Lane A/B - see reconciliation section
  above), plus the root-path fix.
- `src/app/api/admission/schools/route.ts` (Lane C) - added
  `verified_status` to the school select, rate limiting, caching.
- `src/app/api/admission/documents/route.ts` (Lane C) - added magic-byte
  validation to the PUT handler.
- `src/app/api/super-admin/manage-school/route.ts` - Lane B's version
  adopted wholesale (see reconciliation section).
- `src/app/super-admin/school/[id]/SchoolDetailClient.tsx` - Lane B's
  version adopted wholesale (see reconciliation section).
- `src/app/(public)/find-school/FindSchoolClient.tsx` (Lane C) - added
  `VerificationBadge` + `ReportContentButton` to each result card.
- `src/app/schools/[slug]/ProfileClient.tsx` (Lane B) - added
  `ReportContentButton`.
- `src/app/page.tsx` (Lane A) - adopted wholesale; no change needed
  beyond the middleware fix above.
- `src/app/super-admin/SuperAdminDashboard.tsx` - added Content and
  Reports nav entries.
- `src/app/api/public/promotions/route.ts`, `src/app/api/public/rankings/route.ts`
  (Lane E/F) and `src/app/api/public/schools/route.ts`,
  `src/app/api/public/schools/[slug]/route.ts`, `src/app/api/public/stats/route.ts`
  (Lane A/B) - added rate limiting + caching only; no other change.

## Not run against a live database

Same caveat as `sql/admission-system-schema.sql`,
`sql/lane-e-f-promotions-rankings.sql`, and
`sql/migrations/2026-08-18-public-platform-lane-a-b.sql`:
`sql/lane-g-h-i-verification-content-security.sql` has not been executed
against the actual Supabase project. Review it against the live schema
before running, and run it last (it depends on `platform_admins`,
`portal_audit_log`, both in the base schema, and its retirement note for
Lane G's old verification columns assumes Lane A/B's migration - with the
canonical `verified_status` + protective trigger - has already run).
