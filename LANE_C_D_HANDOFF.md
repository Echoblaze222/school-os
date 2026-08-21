# Phase 4 - Lane C + D: Admission Request System
Delivered: schoolos-lane-c-d-admission-system.zip

## What this is
A complete admission request system: public discovery, self-service
signup, apply flow with document upload, applicant tracking, and full
integration into the Secretary dashboard - replacing two disconnected
legacy tools that existed before this lane.

## Key architectural decisions made
1. **One canonical table.** `admission_applications` replaces both
   `public.admissions` and `public.applications` (both were Secretary-
   only, staff-entry, no documents, no real applicant identity). Both
   legacy tables are migrated into the new one and left in place,
   un-dropped, until you've spot-checked the migrated rows.
2. **Self-service signup added (`/join`)**, separate from the existing
   access-code `/login` flow, which is untouched. Creates identities
   with `school_id = null` - never a tenant member until a school
   explicitly admits them.
3. **Global identity vs. school tenant kept separate**, per spec: one
   person's `admission_applications` rows can span many schools without
   ever touching `profiles.school_id`.
4. **Private document storage**, signed URLs only, 15MB/type limits
   enforced at both the API layer and DB constraints. The pre-existing
   `documents` bucket (Secretary's file module) uses `getPublicUrl` -
   a real gap, flagged but not touched, since fixing it wasn't in scope
   for this lane and shouldn't be bundled into this diff.

## Security issues found and fixed during the adversarial review pass
(before this zip was packaged, not after)
- **Self-decision vulnerability**: the applicant-update RLS policy
  checked row ownership but not the values being written - an
  applicant could have called the Supabase client directly and set
  their own application to `accepted`. Closed with a trigger
  (`guard_applicant_admission_update`) that pins staff-only fields and
  restricts applicant-driven status changes to draft/submitted only,
  regardless of which client or code path performs the write.
- **Message spoofing**: an applicant could insert a message flagged
  `sender_is_school = true`, fabricating an official reply in their own
  thread. Fixed with a stricter insert policy that verifies which side
  of the conversation the caller actually is.
- **Mislabeled document policy**: a comment claimed documents were
  immutable; the actual policy (`for all`) granted update/delete too.
  Split into precise per-operation policies; documents are now
  genuinely immutable from every client path.
- **Silent insert failures**: two status-event inserts ran through the
  session client against a table with no session-level insert policy
  (by design, so applicants can't fabricate status history) - they
  would have failed silently. Moved to the admin client, used only
  after the route has independently validated the transition.
- **Path-injection check bug**: a malformed conditional in the document
  registration route would have let a caller register a storage path
  belonging to a different application. Fixed.

## Not done in this pass - flagged, not silently skipped
- Lane A (public landing shell) and the Phase 2 VP dashboard don't
  exist yet. Lane D's dashboard-side integration therefore covers
  Secretary only; Principal/VP review screens are a follow-on once
  those dashboards exist.
- Full UX-motion-prompt polish (staggered entrances, hero transitions,
  contextual success animations) was not applied to these new screens.
  Core principles (button-state intelligence, no silent failures,
  worded error states, skeleton loading on the school directory) are
  in; the fuller motion system from the prompt is a separate pass.
- Repo-wide em-dash cleanup: swept clean in all 28 files touched by
  this lane. A repo-wide grep found the character in ~236 other files
  untouched by this work - flagging rather than sweeping blind, since
  a mechanical find-and-replace across unreviewed files (including
  markdown/docs) risks corrupting something outside this lane's scope.
- Staff-side document upload (attaching a document to a walk-in
  applicant's record on their behalf) isn't built - the current
  document-insert policy is scoped to draft-status applications, which
  walk-in records skip past immediately. Worth a small follow-up if
  staff need it.
- No `tsc`/build was run against this (no node_modules in this
  environment) - reviewed by hand instead. Recommend a full
  `npm run build` before deploying.
