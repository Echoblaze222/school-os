# Phase 4 (Public Platform) merge report

592 files, lanes A–I per PHASE-4-PUBLIC-PLATFORM.md: public marketing
site, school discovery/rankings, self-service signup, admission-request
flow (with the one flagged dashboard-side integration, Lane D), promotions
feed, blog. Genuinely new work, cleanly separated from `dashboard/` as
the spec intended — except for the regressions this report covers.

## The real problem this merge caught

This bundle was exported against an older branch point than my current
tree — same root cause as the Lane 2 and Lane 2-continuation merges,
just showing up differently this time. Because it's a full-tree export
(not a true diff), every file untouched since that branch point still
gets included, byte-identical to source but *stale relative to my tree*
wherever I'd built something on top of the same file afterward. A
blind bulk-copy would silently overwrite that work — and it did, before
I caught it.

**Nine files were silently regressed this way, none of them caught by
`tsc` because the type shapes didn't change, only behavior:**

| File | What was lost |
|---|---|
| `src/lib/supabase/appointments-types.ts` | `EXAM_APPOINTMENT_TYPES` export and every appointment type added after Phase 1 (examination, hostel, ICT roles) |
| `src/components/Icons.tsx` | `HeartIcon` and several others (re-added `MenuIcon`, the one genuinely new Phase 4 icon, on top) |
| `src/lib/notify.ts` | `notifyAppointmentHolders`, `notifyRoles`'s current implementation |
| `src/app/dashboard/principal/subscriptions/SubscriptionClient.tsx` | The Lane 2 continuation's billing-snapshots UI |
| `src/app/api/schools/payment-callback/route.ts` | The 4-argument `activateSchool(..., reference)` call (Lane 2's forgery fix) |
| `src/lib/subscription.ts` | The `cancelled` status in the billing-lock check |
| `src/components/RoleHeroHeader.tsx` | The `GlobalSearchOverlay` integration (Lane 4) |
| `src/components/UniversalAIPage.tsx` | Counselor/ICT/Vice-Principal AI assistant configs |
| `src/components/RoleNav.tsx` | Entire counselor/examination/ICT sidebar sections (see below — this one needed a real merge, not a revert) |
| `src/app/api/push/send/route.ts`, `push/subscribe/route.ts` | Lane 5's Android/FCM dispatch |

All reverted to their correct, verified prior versions. `RoleNav.tsx`
was the one genuine three-way merge: the correct version was missing
Phase 4's two new "Promotions" nav links (principal, secretary — real,
tied to real new pages, confirmed before adding), so I restored the
full correct nav tree and re-added those two links plus the `GlobeIcon`
import on top, rather than picking one side wholesale.

I only caught these by specifically re-checking every file I'd
personally touched across Lanes 1–5, rather than trusting a clean
`tsc` run alone — a clean typecheck only proves the *shapes* still
line up, not that the *behavior* is still there.

## Lane D — the one intentional dashboard integration

Secretary's admission-review page was migrated off a legacy, disconnected
`admissions` table onto the canonical `admission_applications` table
(the same one the public applicant-facing flow writes to), routing
writes through `/api/admission/applications` and
`/api/admission/staff/applications` instead of direct table access —
confirmed both routes and the underlying schema exist before adopting
this. The old `secretary/applications` module (the legacy duplicate) was
removed — confirmed nothing else in the codebase still queries that
table before deleting it. It has no sidebar entry in `RoleNav.tsx`, same
as before this merge — it's reachable from a dashboard tile in
`SecretaryClient.tsx` instead, consistent with the pre-existing pattern,
not a gap this merge introduced.

## Two genuine new-code bugs, fixed (not merge conflicts)

`(public)/apply/[schoolId]/page.tsx` and `dashboard/applications/page.tsx`
both had a Supabase-inference mismatch: a to-one foreign-key join
(`schools:school_id (...)`) gets typed as an array by the untyped query
builder regardless of its actual single-object shape at runtime.
Normalized defensively in both places (take the first element if an
array comes back, use as-is otherwise) rather than gambling on which
shape Supabase actually returns. `(public)/find-school/FindSchoolClient.tsx`
was missing `verified_status` on its local type even though the query
already selects it — added.

## Verification

Full repo `npx tsc --noEmit`: 0 errors, checked at three points —
immediately after the bulk copy (47 errors, all now resolved), after
reverting the type-visible regressions, and again after the silent
(type-invisible) regressions found by manual re-checking.

## Unchanged

The Paystack dashboard Webhook URL is still the standing action item —
nothing in Phase 4 touches or resolves it.
