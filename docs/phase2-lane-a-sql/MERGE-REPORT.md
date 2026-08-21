# Merge report: Lane A (Vice Principal + Org Hierarchy), Lane C (Examination), Lane D (ICT)

## Real conflicts found and how they were resolved

**Four independently-built copies of `src/lib/permissions.ts` now exist
across this project's history** (mine for Counselor, Lane E1's for
Hostel, Lane D's for ICT, Lane A's for VP/Org). All four are now merged
into one file. Three merged with zero collisions. One did not:

- **`requireAppointment` was defined twice with incompatible
  signatures.** Mine: `requireAppointment(supabase, appointmentType)`,
  an API-route helper returning `null` on failure so the caller writes
  its own 401/403 JSON response, already used by 9+ Counselor routes.
  Lane A's: `requireAppointment(appointmentType)`, a server-component
  page guard that creates its own client and **redirects** on failure,
  never returns null. These are not interchangeable and TypeScript would
  not have compiled with both exported under the same name. Lane A's
  version was renamed to `requireAppointmentPage` (my version wasn't,
  since it already had live call sites and Lane A's didn't yet), and
  every one of its 9 call sites across `dashboard/vice-principal/*`, plus
  the two import statements that needed a matching rename, were updated
  and individually re-verified with a grep after the rename, not assumed
  correct.

**`notify.ts`**: Lane A refactored `notifyRoles` into a shared
`notifyProfileIds` helper and added `notifyAppointees(type)` (single
appointment type). Lane D independently added
`notifyAppointmentHolders(types[])` (array of types, plus an
`alsoNotifyPrincipal` option), without the shared-helper refactor. These
solve overlapping but different problems with different APIs. Resolved
by adopting Lane A's cleaner refactored base (functionally identical
`notifyRoles` behavior, just restructured) and keeping Lane D's function
as its own additive export alongside `notifyAppointees`, rather than
picking one and losing the other's capability (array-of-types,
principal-inclusion option).

**`appointments-types.ts`**: three-way merge. Lane C's 6 exam
appointment types plus a new `EXAM_APPOINTMENT_TYPES` export were added
to the version that already carried Lane E1's hostel types, Lane D's
`ict_administrator`, and Counselor. 22 appointment types total, zero
collisions, since every lane picked distinct identifiers.

**`RoleNav.tsx`**: three-way merge (`counselor`, `examination`, `ict`
entries), all additive, one new icon import (`AlertCircleIcon`,
`ArrowLeftIcon`, both already existed in `Icons.tsx`, just weren't
imported yet).

**`middleware.ts`**: Lane C introduced a real improvement here,
generalized `APPOINTMENT_DASHBOARD_SEGMENTS: Record<string, string[]>`,
replacing the ad hoc reasoning I'd documented in Lane B about middleware
"not being able to help" with appointment-based dashboards. Adopted
Lane C's version as the new base, then used the mechanism it introduced
to retroactively register `counselor` and `ict` (closing gaps I'd
flagged in my own earlier reports) and `vice-principal` (Lane A's own
version of this file used an incompatible `Record<string, string>`
shape, single type per segment; not adopted, since the array-based
version already installed handles every lane including exam's 7 possible
committee roles, which a single-type map can't express).

**`TeacherDashboardClient.tsx`**: three-way merge (Lane F's
`ContextSwitcher` + Lane C's Examination Team card), both intact,
verified by diffing Lane C's version against what was already merged and
confirming the only difference was the new card, then re-adding the
`ContextSwitcher` import and render call Lane C's snapshot predated.

**`UniversalAIPage.tsx`** and **`api/ai/chat/route.ts`**: Lane D's ICT
branch merged in alongside the existing Counselor branch at every
insertion point (imports, rate limit, route map, persona, data context).
Lane D's ICT data-context branch calls `requireIctAccess()` a second
time even though the route handler already verified the role claim via
`resolveVerifiedRole()`, this is deliberate redundancy (defense in
depth, the same pattern the Counselor branch already used), not a bug,
left as written.

**`/api/me/contexts/route.ts`**: extended again. Previously special-cased
only `counselor` (added in the last merge). Now also routes
`vice_principal` to `/dashboard/vice-principal`, and any of the 7 exam
appointment types to `/dashboard/examination`, and either ICT appointment
type to `/dashboard/ict`, closing the same "lane shipped after this
route was written" gap for all three at once, the code comments name
each lane explicitly so the next one to ship can find its own spot.

## Claims verified independently before acting on them, per lane

**Lane A's own report claims it independently found and fixed the same
`api/ai/chat/route.ts` role-verification bug already fixed here.** Real,
confirmed independently: not reapplied, since the merged file already
has the fix (and now Lane D's ICT branch on top of it), and Lane A's
snapshot of that file predates every other lane's work on it, so it was
diffed for anything new rather than adopted wholesale.

**Lane A's claim of two duplicate "Showing X features only" cards in
`AllFeaturesSheet.tsx`/`BottomDock.tsx`**: checked directly against the
merged repo's current files. Not present, exactly one occurrence per
file, as expected. No fix needed, noted rather than silently trusted.

**Lane C's claimed build-breaking bugs**: all verified directly before
any fix was applied, not taken on faith. Confirmed real: duplicate
`import motion from ...` lines in 4 secretary client files (would have
failed the build outright); 6 `*MeetingsClient.tsx` files where a
sub-component read `userId`/`schoolId` from a scope it was never passed
(activity-logging-on-join silently did nothing, anywhere, for any role);
6 files with a duplicate `className` JSX attribute silently dropping a
class; `reject-claim` missing `school_id` in a `.select()`, meaning the
`!==` school check always evaluated true and rejection could never
succeed, for anyone; and a genuine duplicate route at
`api/report-card/generate` (`route.ts` using puppeteer, `route.tsx` using
`@react-pdf/renderer`) resolving to the same path, the stale puppeteer
one was deleted.

## Em dashes

Every file installed from Lane C, Lane D, and Lane A was swept before
installation, not after. Lane C had 11 genuinely user-facing instances
(error messages, a textarea placeholder, `Subject — Class` separators
rendered in JSX, a `'—'` fallback character for a null score); these
were hand-rewritten with actual wording changes (`·` to match the
separator convention already used elsewhere in the app, `N/A` for the
score fallback, split sentences for error text), not blindly find-
replaced. Lane D had 2 user-facing instances (a notification body, a
dashboard headline), same treatment. Lane A had zero anywhere in its new
files, already clean. All comment-only occurrences in newly-installed
files were cleaned too.

A repo-wide check afterward found 165 files with an em dash somewhere,
all pre-existing code from before this multi-lane effort, or comments in
lane deliveries outside anything actually edited here. A second check
specifically for em dashes inside quoted strings (the pattern that
usually means user-facing or logged text) found 11 candidates repo-wide;
every one turned out to be either a comment or a server-side
`console.error`/`console.warn` line, never rendered to any user. Zero
genuinely user-facing em dashes remain anywhere in the merged repo. A
full comment-level sweep of the untouched ~165 files was not done here,
it's unrelated to any lane's functional work and would be a very large,
purely cosmetic diff across code nobody asked to have touched; flagging
that trade-off rather than silently deciding it either way.

## Verification performed on the full merged surface

- All 550 `.ts`/`.tsx` files in `src/`: brace-balance checked, all
  balanced.
- No duplicate `route.ts`/`page.tsx` at the same path anywhere under
  `src/app` (the exact class of bug that broke `report-card/generate`).
- Every `@/...` import across the ~90 files touched or installed in this
  pass resolved against a real file on disk; two gaps found this way
  (`lib/supabase/departmentWork.ts` was referenced but not yet copied
  in, `lib/supabase/appointments.ts`'s own dependency chain checked
  transitively) and fixed before considering the pass done.
- `requireAppointmentPage` rename verified with a grep for any leftover
  bare `requireAppointment` reference across every Lane A file, twice
  (once after the body-call-site rename, once after the import-statement
  rename, since the first pass missed the imports).

No live build was run (no network access for `npm install` in this
environment), so this remains static verification, not a compile check.
Worth a real `pnpm build` before this goes to production, same caveat as
every prior merge report in this series.

## Still open

Per each lane's own stated scope:

- Lane A deliberately didn't build department objectives/tasks/
  schedules backing UI beyond what `departmentWork.ts` + its API routes
  already support (the data layer is real and wired; some of the surface
  area described in §3 wasn't built as UI in this pass, by that lane's
  own explicit call, not an oversight caught here).
- Lane C and Lane D's own "not started" lists (from their respective
  reports) are unchanged by this merge, nothing in this pass expanded
  either lane's scope beyond what each delivered.
- The stale `#7C3AED` violet fallback flagged after the very first
  Counselor merge is still present in files no lane has touched since.
  Still nobody's assigned lane, per the same reasoning as before.
