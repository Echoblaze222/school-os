# SchoolOS — Phase 2, Lane C: Examination Team System
Delivery report — build verified clean (Turbopack build + `tsc --noEmit`, zero errors from any Lane C file).

## What this is
A committee dashboard at `/dashboard/examination` for six new appointed positions (Examination Officer already existed from Phase 1; Coordinator, Secretary, Setter, Invigilator, Result Officer, Result Verification Officer are new), plus a verify/publish layer added **on top of** the existing `results` table — teacher and principal results flows are untouched and keep working exactly as before.

## How to apply
1. **Read `06-SECURITY-NOTES.md` and `01-AUDIT.md` again before touching prod** — Lane C assumes the Phase-1 rate-limit hotfix is already live (it is, in this zip — verified `first-login`/`code-signin` both call `checkRateLimit`).
2. Run `docs/security-hotfix` first if you haven't (unrelated to this lane, just confirming order).
3. Review `src/lib/supabase/lane-c-examination-schema.sql` against the **live** Supabase schema — this repo has no migration history, so I can't diff against what's actually deployed. Every statement is idempotent (`if not exists`, `on conflict do nothing`) so it's safe to re-run, but read it once before applying.
4. Apply the SQL in a transaction (it already wraps itself in `begin`/`commit`).
5. Deploy the code changes.
6. A teacher appointed to any exam-committee position sees an "Examination Team" card on their normal teacher dashboard linking to `/dashboard/examination`. Nothing changes for teachers without an appointment.

## What's built (Tier 1 — verified working)
- **Appointments**: 6 new `appointment_types`, capability table in `examPermissions.ts` mirrored by SQL RLS — no exam-team member automatically gets every function (Invigilator only touches sittings they're assigned to; Exam Setter only touches documents they created; verify and publish are separate, narrower rights than approve).
- **Exam sessions, timetable, rooms** — CRUD, scoped to coordination-level appointments + Principal.
- **Invigilation** — assignment by coordinators, self-confirmation by the assigned invigilator via a locked-down RPC (see Security section).
- **Exam attendance** — an invigilator only ever sees and marks sittings they're actually assigned to, enforced by RLS (`is_assigned_invigilator`), not just hidden UI.
- **Question-paper/marking-scheme workflow** — drafting → submitted → under_review → approved → printed → distributed → collected → archived, with a full custody chain (`exam_document_events`) that's write-only through a server API route, not raw client calls, so it can't be forged or skipped.
- **Incidents/malpractice log** — any staff member present can report; only coordination roles resolve.
- **Results workflow extension** — added `verified`/`published` columns to the existing `results` table (non-breaking, with a backfill so nothing already visible to a parent disappears). New order: posted → verified → approved → published. Verify and publish are separate API routes using the service-role client, rate-limited, batch-capped at 500, with proper audit logging to `portal_audit_log`.
- **Discoverability**: teacher dashboard shows a link to the committee dashboard only if the signed-in teacher holds an active exam appointment; `RoleNav` gained an `examination` entry; middleware gates the whole `/dashboard/examination` tree by active appointment (outer floor), `getExamContext.ts` re-checks server-side on every page load (inner floor).

## Real gap found and fixed along the way (not part of the original ask, but directly relevant)
`src/app/dashboard/student/results/page.tsx` and `parent/results/page.tsx` had **no approval or publication filter at all** — every result a teacher posted was visible to the student/parent immediately, regardless of the existing `approved` flag. Since "publication" is the entire point of this lane, I made `published = true` the actual visibility gate and backfilled `published = approved` for existing rows so nothing currently visible disappears on deploy.

## Security pass — 3 real issues found and fixed (not hypothetical)
Doing an honest adversarial read of my own RLS policies before shipping:
1. **Document custody self-tampering**: the exam-setter's own-draft edit policy didn't stop them from silently reassigning `current_custodian_id` away from themselves while still in drafting state, bypassing the audit trail. Fixed — that policy now pins `current_custodian_id = auth.uid()` while drafting.
2. **Invigilator assignment retargeting**: the original "it's my row" self-update policy would have let an invigilator rewrite `exam_timetable_id` on their one legitimate assignment to point at a completely different exam sitting, granting themselves unauthorized attendance-marking/seating access. Fixed — self-confirmation now only happens through `confirm_invigilator_duty()`, a `SECURITY DEFINER` function that can set status to `confirmed` and nothing else.
3. **Result integrity on insert/update**: the original `results` RLS would have let a Result Officer insert a row that's already `approved/verified/published = true` in one call, or let a Result Verification Officer edit a student's actual score directly from the browser (their intended power is only "verify"). Fixed — inserts now force `approved/verified/published = false`, and verify/publish are removed entirely from the client-writable RLS surface; they only happen through the two rate-limited API routes using the service-role key.

## Explicitly deferred (Tier 2 — not built this pass, said honestly rather than left vague)
- **Seating charts / visual room layout** — the `exam_seating` table and RLS exist, but there's no UI for assigning specific seats yet, only the data model.
- **Exam reports/analytics dashboard** (pass rates, subject performance) — not started.
- **Marking-status tracking per script** (beyond the document-level custody workflow) — not started.
- **Student/parent-facing exam timetable view** — Lane C's dashboard is staff-only; a student-visible timetable page wasn't in scope for the *committee* system and would need its own UX pass.
- **UX/Motion master prompt** — that spec is written for Flutter; this codebase is Next.js/React. Not applied. Happy to translate specific principles (skeleton loading, error UX, motion system) to this stack in a separate pass if wanted.
- **Hostel/ICT expansion doc** — untouched this pass, per your "Lane C only" confirmation.

## Files changed
34 files total — see the zip. New: everything under `src/app/dashboard/examination/`, `src/app/api/examination/`, `src/lib/supabase/{lane-c-examination-schema.sql,examPermissions.ts,getExamContext.ts}`. Modified: `appointments-types.ts`, `RoleNav.tsx`, `middleware.ts`, `teacher/page.tsx` + `TeacherDashboardClient.tsx`, `student/results/page.tsx`, `parent/results/page.tsx`, plus 4 pre-existing secretary files that had a duplicate-import bug blocking the entire production build (`AdmissionsClient.tsx`, `ClinicClient.tsx`, `StudentsClient.tsx`, `TransfersClient.tsx` — one-line fix each, unrelated to Lane C but the build wouldn't compile at all without it).

## One thing to flag, not fixed here
Your uploaded zip was missing `tsconfig.json` and `next.config.*` at the root — every `@/` import failed to resolve until I reconstructed `tsconfig.json` (you then supplied the actual one, which I used). Worth checking your zip export process; if `next.config.*` is also genuinely missing from the real repo rather than just this export, that's worth a look too.
