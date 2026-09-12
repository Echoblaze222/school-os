# Design consistency audit

Tracking doc for the app-wide design consistency migration. Multi-session
effort, confirmed by the user on [date of first pass]. Read this before
starting any further design-consistency work on this repo.

## The core finding

There's no shortage of design tokens - `globals.css` already defines a real
system (`.btn` / `.btn-primary` / `.btn-secondary`, `.input`, `.glass-card` /
`.glass-card-flat`, spacing/radius/color custom properties). The problem is
inconsistent **adoption**: many pages hand-roll inline `style={{}}` objects
that duplicate (and drift from) these shared classes, and there are three
competing page-header/layout systems in simultaneous use:

- `RoleHeroHeader` - dashboard home screens only. Not in question, leave as is.
- `RoleSubHeader` - the newer pattern (back button/callback + title, pairs
  with the bottom nav dock). **This is the target** - confirmed by the user.
- `RolePageWrapper` - the older pattern, still renders the old sidebar
  (`RoleNav`) that `RoleSubHeader`'s own code comments call obsolete.
- ~14 pages hand-roll a fully custom header, using neither.

**Decision (confirmed):** migrate everything to `RoleSubHeader`, despite
`RolePageWrapper` having more raw usages (108 vs 18) at the time of writing -
`RoleSubHeader` matches the mobile-first bottom-dock pattern used throughout
the actual product; `RolePageWrapper`'s sidebar does not match any real
screenshot of this app seen so far.

## Concrete drift patterns found (recur across many files, not just Quiz)

- Inline `style={{ height: 40, padding: '0 12px', background: 'var(--input-bg)', border: '1px solid var(--input-border)', borderRadius: 8, ... }}`
  on `<input>`/`<select>` instead of `className="input"`. The shared class is
  48px tall with a 12px radius and a real `:focus` ring; the inline version
  has none of that (inline styles can't express `:focus` at all).
- Inline label styles instead of `className="input-label"`.
- Hand-rolled `style={{ background: 'var(--glass-bg)', border: '1px solid var(--glass-border)', borderRadius: 10, ... }}`
  card boxes that are byte-for-byte what `.glass-card-flat` already provides.
- Hardcoded button styling instead of `.btn` + a modifier class. Watch for
  per-school dynamic brand colors (`sc`/`schoolColor` variables) when
  migrating buttons - `.btn-primary` uses the *static* `--brand` token, so a
  naive swap silently drops per-school branding. Use bare `.btn` (sizing/
  shape only) plus an inline `background: sc` override to preserve it.
- **Real bug, not just drift:** `src/app/dashboard/teacher/assignments/new/NewAssignmentClient.tsx`
  uses `var(--error)` for its character-count warning color. `--error` is
  never defined anywhere in `globals.css` - only `--danger` is. The warning
  color silently never applies. Not yet fixed.

## Migration recipe (per RolePageWrapper page)

1. If the role doesn't have `src/app/dashboard/<role>/featureGroups.ts` yet,
   extract it from that role's `<Role>DashboardClient.tsx` (its
   `FEATURE_GROUPS` constant), matching the pattern already done for
   `parent`, `student`, and `teacher`. Update the dashboard client to import
   it instead of defining it locally.
2. Swap `import RolePageWrapper from '@/components/RolePageWrapper'` for
   `import RoleSubHeader from '@/components/RoleSubHeader'` +
   `import { <ROLE>_FEATURE_GROUPS } from '../featureGroups'`.
3. Replace `<RolePageWrapper ... showBack={false}>` with
   `<RoleSubHeader ... featureGroups={<ROLE>_FEATURE_GROUPS}>`. Drop
   `showBack` (not a RoleSubHeader prop). If the page is a single route with
   its own back button already (multi-step flows, wizards), use
   `onBack={<theLocalGoBackFunction>}` instead of the default `backHref`; if
   it's a plain single-step page, omit both and let it default to the
   role's dashboard home. If there's a hand-rolled "← Back" button inside
   the page that duplicates what the header now does, remove it.
4. Replace inline-styled inputs/labels/cards/buttons with the shared classes
   per the drift patterns above, preserving any genuinely dynamic values
   (per-school colors, computed widths, etc.) as scoped inline overrides
   layered on top of the shared class - don't force a static value onto
   something that was legitimately dynamic. Check `globals.css` for the
   closest real shared class before assuming something needs custom CSS.
5. `npx tsc --noEmit -p tsconfig.json` clean before committing. Read the
   full diff before committing.

## Already done

- **`examination` role: fully migrated, 0 files remaining.**
  `featureGroups.ts` created; `ExaminationDashboardClient.tsx` migrated
  to use it (kept `ShieldIcon` imported separately - also used
  directly in the dashboard home's JSX, not just in `FEATURE_GROUPS`).
  All 8 files migrated: attendance, timetable, profile, invigilation,
  incidents, sessions, results, documents.
  - `attendance/AttendanceClient.tsx` had two separate
    `RolePageWrapper` usages (an early-return empty state plus the
    main render) - both needed migrating, easy to miss if only
    grepping for the JSX tag once.
  - `results/ResultsWorkflowClient.tsx`'s title contains an ampersand
    ("Verify & Publish Results"), which broke a `sed` replacement on
    the first pass since `&` is a special character in `sed`'s
    replacement string (it means "insert the matched text"). Worth
    remembering for any future batch `sed` migration - titles with
    `&`, `\`, or numbered backreferences need manual handling instead.
  - `profile/ProfileClient.tsx` had the same hand-rolled-gradient-
    button + hardcoded-hex-color pattern already found in student/
    secretary - fixed to the shared `.btn` class and the real
    `--success`/`--danger` tokens.
  - Spot-checked the rest of the batch for the same drift -
    attendance, invigilation, incidents, and sessions all already
    correctly reference the real `--warning`/`--success` tokens (not
    the `--status-warn`/`--status-ok` mixup from earlier this
    session) - no changes needed there.
- **`secretary` role: fully migrated, 0 files remaining.**
  `featureGroups.ts` created; `SecretaryClient.tsx` migrated to use it
  (dropped `ClipboardIcon`/`FileTextIcon` from the import list entirely
  - both were already-unused dead imports before this change, not the
  "icon used outside FEATURE_GROUPS" gotcha seen in earlier batches).
  All 14 files migrated: records, users, library, profile, meetings,
  settings, clinic, students, codes, transfers, calendar, applications,
  documents, admissions.
  - Fixed 3 hand-rolled buttons with per-school dynamic color to use
    the shared `.btn` class (`records`: "+ New" and "Create Record";
    `profile`: "Save Changes", which also had an unnecessary gradient
    - flattened to a solid per-school color).
  - Fixed 2 hardcoded hex colors (`#10B981`/`#EF4444`) that were exact
    literal copies of `--success`/`--danger` - replaced with the real
    tokens. Left `records/RecordsClient.tsx`'s `positive`/`negative`
    record-type color map alone - that's a business-domain concept
    map, not accidental token drift, even though the values happen to
    match.
- `src/components/RoleSubHeader.tsx` - added optional `onBack` callback,
  needed for multi-step/wizard pages. Backward compatible.
- **`teacher` role: fully migrated, 0 files remaining.** `featureGroups.ts`
  created; `TeacherDashboardClient.tsx` migrated to use it. All 16 files
  that referenced `RolePageWrapper` (quizzes, clinic, announcements,
  meetings, submissions, classes, timetable, audit, live, notes, profile,
  assignments, attendance, syllabus, results, grades/page) migrated to
  `RoleSubHeader`, with the input/button/card drift fixed wherever found.
  `teacher/quizzes/QuizzesClient.tsx` is the most thorough example (list,
  create, add-questions, preview/edit all migrated) - use it as the
  reference for future migrations.
- **`principal` role: fully migrated, 0 files remaining.**
  `featureGroups.ts` created; `PrincipalDashboardClient.tsx` migrated to
  use it. All 18 files that referenced `RolePageWrapper` migrated to
  `RoleSubHeader` (one, `results/PrincipalResultsClient.tsx`, turned out
  to be a comment-only false positive and needed no change). See the
  patterns section below this one for specific findings from this batch.
- **`student` role: fully migrated, 0 files remaining.**
  `featureGroups.ts` created; `StudentDashboardClient.tsx` migrated to
  use it (kept `ClipboardIcon`/`TrophyIcon` imported separately since
  those are still used directly in KpiCards on the dashboard home -
  same "icon used outside FEATURE_GROUPS" gotcha as the principal batch).
  All 14 files migrated: certificates, library, alumni, notes, meetings,
  quizzes, classes, results, syllabus, schedule, live, leaderboard,
  assignments. `quizzes/[id]/QuizTakeClient.tsx` was a comment-only
  false positive, no change needed.
  - **Dynamic role, not just dynamic role prop.** `leaderboard/LeaderboardClient.tsx`
    renders for both students and parents (`role={isParent ? 'parent' : 'student'}`).
    The naive fix (pass `STUDENT_FEATURE_GROUPS` always) would have shown
    student nav links to parents. Had to import `PARENT_FEATURE_GROUPS`
    too and pick per `isParent`. Worth checking for on any page shared
    across roles, not just pages with a single hardcoded role.
  - Rest of the student batch (library, notes, meetings, classes,
    syllabus, live, schedule, results) had already had their inline-style
    drift cleaned up in an earlier "REDESIGN PASS" - only the wrapper
    swap was needed, no new drift found.
  - Fixed one hand-rolled button pair (download/copy in
    `certificates/StudentCertificatesClient.tsx`) to use `.btn`/`.btn-secondary`.
  - Cleaned a stale comment in `assignments/AssignmentsClient.tsx` that
    described the wrapper migration as still undecided.
- **All 13 dashboard home screens - "de-AI the dashboard" pass applied
  app-wide, NOT part of the RolePageWrapper migration.** Started as a
  bursar-only ask (apply the "5 tells of AI-made UI" video's fixes -
  equal-weight tiles, generic greeting copy - to just its dashboard
  home), then extended to all 13: bursar, nurse, librarian, coach,
  counselor, hostel, parent, secretary, teacher, student, examination,
  vice-principal, principal. Explicitly NOT their `RolePageWrapper`/
  `RoleSubHeader` sub-pages - those remain a separate, still-pending
  piece of work (see the per-role checklist below).
  - **Hierarchy fix, same shape everywhere:** each dashboard had 3-8
    equal-weight `GaugeStat`/`KpiCard` tiles in a flat grid. Replaced
    with one primary hero card (the single most meaningful number -
    money for bursar/principal, GPA for student/parent, roster size
    for teacher/coach/librarian, active caseload for counselor, etc.)
    plus 2-3 smaller secondary tiles beside it. Where a page also had
    a *second*, redundant KpiCard row further down repeating numbers
    already in the primary card (bursar, secretary, teacher, student,
    vice-principal, principal all had this), that row was removed
    entirely rather than left duplicated.
  - **Copy fix, same shape everywhere:** headlines changed from
    generic filler ("Clinic Dashboard", "Library Dashboard",
    "Counseling Dashboard", "Coaching Dashboard", "Here's how the
    school stands today.", "Your classroom, today.", etc.) to
    numbers-driven copy built from the same data already being
    fetched (e.g. "₦2.4M collected · 78% of fees", "4.2/5.0 GPA · 92%
    attendance"). `hostel` and `parent`/`student` had partially
    reasonable copy already (hostel names, "How X is doing.") so got
    a lighter touch - hostel's static sub-copy made numbers-driven,
    parent/student's headline blended personalization with numbers
    rather than replacing it outright.
  - **False alarm, since corrected: `--status-warn`/`--status-ok` are
    NOT a bug.** Initially misdiagnosed these as the same
    undefined-CSS-variable class as the `--error` bug above (neither
    is defined as a static value in `globals.css`) and "fixed" them to
    the static `--warning`/`--success` tokens across all 11 affected
    dashboard-home files. That was wrong: `SchoolBrandInjector.tsx`
    (wired into every dashboard `layout.tsx`) sets both variables at
    runtime, deliberately steering them away from whatever hue the
    school's own `primary_color` uses - so a green-branded school's
    "on track" indicator doesn't collide with its own brand color (see
    the `hueOf`/`hueDistance` logic and comment in that file).
    `--status-warn`/`--status-ok` are intentional and more
    brand-aware than the static tokens that replaced them - the
    "fix" silently broke that hue-avoidance behavior for every school.
    Reverted all 25 instances back to `var(--status-warn, #E4572E)` /
    `var(--status-ok, #3FA66B)` in a follow-up commit. A larger sweep
    of ~27 more files (sub-pages plus shared components like
    `KpiCard.module.css`, `GaugeStat.tsx`, `DepartmentCard.module.css`)
    was drafted but caught and discarded before committing, once
    `SchoolBrandInjector.tsx` turned up in the same grep. **Lesson:
    before "fixing" any CSS variable that looks undefined, grep for
    where it's set at runtime (`.setProperty(`, inline `<script>`
    injectors) - `globals.css` isn't the only place a variable can be
    defined.**
  - **`RoleHeroHeader`'s gradient (tell #1 in the video) was
    deliberately left alone in this pass** since it's shared across
    every role and out of scope for a per-page hierarchy/copy fix -
    but a concurrent commit from the same session window
    (`c792503`, "Fix dashboard-home avatar bug, emoji icons, and
    gradients") happened to fix exactly that tell app-wide anyway
    (replaced `RoleHeroHeader`'s banner/avatar-ring gradients and
    `AiInsightBanner`'s background gradient with solid brand-derived
    colors). Between the two efforts, tells #1, #2/#3 (icon tiles/
    hierarchy), and #5 (copy) from the video are now addressed
    app-wide on every dashboard home. Tell #4 (shadows) was checked
    and found to already be correctly scoped everywhere (shadows only
    on genuinely floating elements - bottom docks, home buttons - not
    on static cards), so nothing needed there.
  - **The 13 `RolePageWrapper`/`RoleSubHeader` sub-pages for bursar,
    secretary, examination, counselor, nurse, coach, and librarian are
    still outstanding - see the checklist below.**

### Patterns discovered during the teacher batch (apply to future roles too)

- **Hand-rolled "← Back" buttons that duplicate `onBack`.** Multi-step
  pages (Quiz, PostResults) had their own back button wired to local state
  (e.g. `setMode('overview')`), built *inside* `RolePageWrapper` because
  that wrapper had no callback-based back option. Once migrated to
  `RoleSubHeader` with `onBack`, these are pure duplication - remove them.
  Also check for now-orphaned icon components that only that button used
  (e.g. `PostResultsClient.tsx` had an `IcBack` SVG left over after its two
  call sites were removed).
- **Comment-only false positives.** `grep -rl "RolePageWrapper"` can match
  a stale comment that just *mentions* the name without the page actually
  using it (`teacher/audit/page.tsx` had this - the real usage was in the
  sibling `AuditClient.tsx`). Check before assuming a grep hit needs a
  wrapper swap; fix the comment wording while there for cleanliness.
- **Not every custom input should become `.input`.** `.input` is
  `width: 100%` by design - it will break a compact, fixed-width field
  (e.g. `PostResultsClient.tsx`'s 68px per-student score box in a grading
  grid). Check the actual layout context before forcing the shared class;
  leaving a genuinely bespoke, purpose-built input alone is the correct
  call here, not a missed fix.
- **Possible duplicate feature, not yet investigated:**
  `teacher/grades/page.tsx` and `teacher/submissions/SubmissionsClient.tsx`
  both title themselves "Grade Submissions" and appear to serve an
  overlapping purpose. Both were migrated (wrapper-only, no functional
  change), but nobody has checked whether one is dead code, a duplicate
  route, or two genuinely different flows that happen to share a name.
  Worth a look before doing more work in either file.

## Remaining (RolePageWrapper usages by role, at time of writing)

- [x] ~~**principal** - 18 files~~ - **done, 0 remaining**
- [x] ~~**teacher** - 15 files remaining (quizzes done)~~ - **done, 0 remaining**
- [x] ~~**student** - 14 files~~ - **done, 0 remaining**
- [x] ~~**secretary** - 14 files~~ - **done, 0 remaining**
- [ ] **bursar** - 13 files
- [x] ~~**examination** - 8 files~~ - **done, 0 remaining**
- [ ] **counselor** - 6 files
- [ ] **nurse** - 5 files
- [ ] **coach** - 4 files
- [ ] **librarian** - 3 files
- [ ] shared components (`DashboardHeader.tsx`, `StaffMeetingsClient.tsx`,
      `UniversalAIPage.tsx`) - 3 files, check whether these are still
      referenced anywhere before touching
- [ ] **ict** - 1 file
- [ ] **hostel** - 1 file
- [ ] **applications** (`src/app/dashboard/applications/page.tsx`) - 1 file,
      check which role this belongs to

None of these roles have a `featureGroups.ts` file yet - step 1 of the
recipe above applies to all of them. `teacher/featureGroups.ts` and
`principal/featureGroups.ts` are the reference examples for the
extraction pattern.

### More patterns discovered during the principal batch

- **Double-check icon imports when extracting a `featureGroups.ts`.**
  During the principal extraction, a first pass removed icons that were
  actually used elsewhere in the dashboard client's JSX body (KpiCards),
  while accidentally keeping ones that were only ever used inside the
  extracted `FEATURE_GROUPS` array. `grep -c '<IconName' file.tsx` per icon
  before finalizing catches this - a diff that "looks plausible" isn't
  enough.
- **A `showBack`/conditional-visibility flag sometimes hides a real bug.**
  `PrincipalMeetingsClient.tsx` toggled the old wrapper's back button
  on/off based on view mode, relying on generic back-navigation to
  "return to list" - which doesn't reliably work within a single-route,
  multi-mode component. Migrating to `onBack` with an explicit mode-reset
  callback isn't just parity, it's a correctness fix. Look for this
  pattern (a boolean visibility prop instead of a real destination)
  whenever migrating a multi-mode page.
- **Not every grep hit is actually on `RolePageWrapper`.** Two more
  comment-only false positives this batch (`results/PrincipalResultsClient.tsx`
  explains its own inline color fallback by contrasting with
  `RolePageWrapper`, without ever using it). Confirm actual JSX usage,
  not just string presence, before assuming a file needs migration.
- **Dynamic `role` prop.** `promotions/PromotionsClient.tsx` passes
  `role={profile.role}` instead of a literal string - don't assume the
  role prop is always hardcoded per file; check before templating a
  batch script.

## Not yet started

- The `--error` CSS variable bug (see above)
- Auditing the other role dashboards' home screens themselves (only
  `student` has been spot-checked so far, in a separate earlier pass - see
  git history for "clean(student dashboard)")
- The ~14 fully-custom-header pages (neither RolePageWrapper nor
  RoleSubHeader) - not inventoried yet, `grep -rl "className={styles.header}\|<header" --include="*.tsx" src/app/dashboard`
  is a rough starting point, not a precise list
