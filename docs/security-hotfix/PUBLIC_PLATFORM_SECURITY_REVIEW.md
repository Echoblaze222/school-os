# Public Platform Security Review (Phase 4, Lane I - §64)

Static/code review against the §64 checklist, covering everything shipped
in Lanes C, D, E, F, G, H as merged. Not a substitute for a live penetration
test against a deployed environment with real data - that still needs to
happen before this goes to production, using this document as the checklist
starting point rather than starting from zero.

| # | §64 item | Status | Where enforced |
|---|---|---|---|
| 1 | Cross-school application access | **Covered** | `admission_applications_staff_read`/`_update` RLS policies (`sql/admission-system-schema.sql`) scope every staff row-read to `p.school_id = admission_applications.school_id`. No policy grants cross-school access under any condition. |
| 2 | Cross-school document access | **Covered** | `admission_documents` RLS (same file) mirrors the application-ownership check; storage bucket policy keys off the `<school_id>/<application_id>/...` path prefix, never a public URL. |
| 3 | Unauthorized school profile modification | **Covered** | All `schools` writes from the public platform go through `/api/super-admin/manage-school` (admin client + `platform_admins` check) or existing principal-scoped RLS (`my_school_id()` + `my_role() = 'principal'`) - no path lets an arbitrary authenticated user write another school's row. |
| 4 | Fake school creation | **Partially covered** | `/api/super-admin/create-school` requires `platform_admins` membership - a random visitor cannot create a school row. `schools.verified_status` (Lane B, §51) adds a public trust signal on top of this, but does not itself gate creation - that's an existing Lane 1/2 control, out of this phase's scope to change. |
| 5 | Fake admission decisions | **Covered** | `guard_applicant_admission_update()` trigger (found + closed during Lane C/D's own adversarial pass) pins every staff-only field (`reviewed_by`, `decision_notes`, `status` outside draft/submitted, etc.) back to its prior value whenever the caller is the applicant themselves - closes a real self-decision vulnerability that RLS's `USING`/`WITH CHECK` alone could not (RLS can't do column-level restriction). |
| 6 | Applicant impersonation | **Covered** | `admission_applications_applicant_write`/`_read` require `applicant_profile_id = auth.uid()`. Document uploads separately re-check `application.applicant_profile_id !== user.id` at the API layer before issuing a signed upload URL. |
| 7 | School administrator impersonation | **Covered** | `admission_messages.sender_profile_id` is always `auth.uid()` from the authenticated session, never a client-supplied value - a message cannot claim to be from staff without actually being sent by an authenticated staff account of that school. |
| 8 | Promotion privilege escalation | **Owned by Lane E/F, not re-verified here** | `school_promotions` write policies scope to `my_school_id()` + staff role, with a separate `requires_moderation`/moderation workflow (`/api/super-admin/promotions/[id]/moderate`) for anything flagged. Flagging this for Lane E/F's own review rather than asserting it here, per "don't touch another lane's folder." |
| 9 | Ranking manipulation | **Owned by Lane F, not re-verified here** | `school_ranking_scores` is written by `compute_ranking_scores()`, not directly by any client role. Same note as above - Lane F's file, Lane F's verification. |
| 10 | Public/private data leakage | **Covered** | Every public route in this phase (`/api/admission/schools`, `/api/public/promotions`, `/api/public/rankings`, `/api/public/content`) uses an explicit column allowlist in its `.select()`, not `select('*')` - a new column added to any of these tables cannot leak into a public response by accident. |
| 11 | Search data leakage | **Covered** | `/api/admission/schools` filters entirely on `admission_settings.is_enabled = true` at the RLS layer (anon client cannot see disabled schools' settings, regardless of query params) before the `q` text filter is even applied client-side of the DB call. |
| 12 | API tenant bypass | **Covered** | Every staff-facing table in this phase has RLS keyed on `my_school_id()`/direct `school_id` equality checks - server-side authorization, not client-trusted `school_id` parameters. |
| 13 | Malicious document upload | **Fixed this lane** | Previously, `/api/admission/documents` PUT trusted the caller-declared `mimeType` with no verification against actual file bytes - a disguised executable could be registered as `application/pdf`. Now verifies the real file signature (magic bytes) for PDF/JPEG/PNG/WEBP before registering the document; a mismatch deletes the orphaned object and rejects with a clear error. `scan_status` moves `pending -> clean` only after this check passes. This is signature verification, not a full malware/antivirus scan - documented as such in the route's comments. |
| 14 | Unauthorized admission status modification | **Covered** | Same `guard_applicant_admission_update()` trigger as #5; staff-side status changes are additionally scoped to `p.school_id = admission_applications.school_id`. |
| 15 | Public route reachability (middleware) | **Fixed this lane** | Lane A/B's delivery included no `middleware.ts` changes at all - `/find-schools`, `/schools/[slug]`, `/api/public/schools`, and `/api/public/stats` were all missing from `PUBLIC_PATHS`, meaning every one of them would have force-redirected an unauthenticated visitor to `/login` in production, including all of Lane A's landing page links. Separately, the existing root-path handler unconditionally redirected `/` to `/splash` for signed-out visitors, which would have made the new landing page (`src/app/page.tsx`) completely unreachable. Both fixed in `src/middleware.ts`. |
| 16 | Public discovery endpoint traffic isolation | **Fixed this lane** | `/api/public/schools` and `/api/public/schools/[slug]` (Lane B) had no rate limiting or caching, unlike their own sibling `/api/public/schools/[slug]/inquiries` (which already had strong IP + per-school rate limiting) and every other public read endpoint on the platform. Added, matching the existing pattern. |

## New in this lane (§52, §62)

- **`content_reports`** - public reporting/takedown queue. No SELECT/UPDATE
  policy exists for any client role; only the admin client (via
  `/api/super-admin/reports`) can read or resolve reports, so a reporter
  can never see or tamper with the status of their own or anyone else's
  report. INSERT is rate-limited per IP (5 / 10 min) to prevent queue
  flooding.
- **`schools.verified_status`** (Lane B) - protected at the database
  level by the `prevent_school_protected_field_update` trigger, which
  rejects any change to this column outside the service-role client -
  stronger than an RLS-omission approach, since it defends even against
  a future bug that grants principals broader `schools` table access.
  The only write path is `/api/super-admin/manage-school`
  (`set_verified_status` action). Lane G originally shipped a parallel
  `verification_status` column with weaker (RLS-omission-only)
  protection; retired during reconciliation once Lane B's version was
  found to already cover the same requirement more robustly - see
  `LANE_G_H_I_HANDOFF.md`.
- **`content_posts`** - no INSERT/UPDATE/DELETE policy for any client
  role, including an authenticated platform_admin's own session client -
  every write goes through `/api/super-admin/content*`, using the admin
  client after that route's own `platform_admins` check.

## Rate limiting / caching added this lane (§63)

Reused the existing `check_rate_limit()` Postgres function and
`checkRateLimit()` helper (already relied on by `/api/auth/self-register`
and `/api/admission/applications`) rather than introducing a second
mechanism:

| Endpoint | Scope | Limit | Cache |
|---|---|---|---|
| `/api/admission/schools` | `public_school_search` | 60 / min / IP | `s-maxage=60` |
| `/api/public/promotions` | `public_promotions_read` | 120 / min / IP | `s-maxage=60` |
| `/api/public/rankings` | `public_rankings_read` | 120 / min / IP | `s-maxage=180` |
| `/api/public/content` (list) | `public_content_read` | 120 / min / IP | `s-maxage=120` |
| `/api/public/content/[slug]` | `public_content_read` | 120 / min / IP | `s-maxage=300` |
| `/api/public/reports` | `public_report_submit` | 5 / 10 min / IP | not cached (write) |
| `/api/public/schools` | `public_school_directory_read` | 120 / min / IP | `s-maxage=60` |
| `/api/public/schools/[slug]` | `public_school_profile_read` | 120 / min / IP | `s-maxage=120` |
| `/api/public/stats` | none (see route comment - no query params to vary, long cache window gives equivalent protection) | - | `s-maxage=300` |

All limits fail closed (an unavailable limiter blocks the request rather
than letting it through) - same choice already made for the account-
takeover-sensitive auth endpoints, applied consistently here.

## Explicitly out of scope for this review

- Lane A/B (landing page shell, school discovery profile pages) have not
  landed yet, so their public surface area could not be reviewed here.
  Re-run this checklist against them once they exist.
- No live penetration test was run - this is a code/schema review only.
