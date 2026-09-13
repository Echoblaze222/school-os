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

- **The RolePageWrapper -> RoleSubHeader migration is now complete
  everywhere it was ever used.** A full-repo `grep -rl "RolePageWrapper"
  src --include="*.tsx"` turns up zero real imports or JSX usages - the
  only hits left are historical comments in already-migrated files
  (documenting past migrations) and the `RolePageWrapper.tsx`
  definition file itself, which is now dead code (nothing imports it -
  confirmed via a separate grep for `from '@/components/RolePageWrapper'`
  excluding the file itself). Not deleted - flagging as a removal
  candidate rather than deleting unasked.
  - `ict` and `hostel` both turned out to need work that was missing
    from every earlier list: neither had a `featureGroups.ts` (their
    dashboard-home clients had local `FEATURE_GROUPS` never extracted),
    and both had exactly one `RolePageWrapper` file - `profile/
    ProfileClient.tsx`. Both fixed the same way as every other role.
  - `StaffMeetingsClient.tsx` (shared `/meetings` page for coach, ict,
    examination, librarian, counselor, hostel, vice-principal, nurse)
    and `UniversalAIPage.tsx` (shared `/ai` page for all 14 roles) both
    take a dynamic `role` prop, so neither could just import one
    `featureGroups.ts` like a normal sub-page - each needed a
    `Record<string, FeatureGroup[]>` lookup map built from every
    relevant role's own file. Worth remembering for any other shared,
    role-parameterized component found later.
  - **`RoleSubHeader` gained `fullHeight` support, which didn't exist
    before.** `UniversalAIPage.tsx` needs it (chat-style layout: own
    sticky input bar, no page padding/max-width, locked to viewport
    height) - `RolePageWrapper` had this via a `fullHeight` prop plus
    an unconditional `useVisualViewportHeight()` call for keyboard-safe
    height on iOS (dvh doesn't shrink for the on-screen keyboard the
    way visualViewport does). Added the same to `RoleSubHeader`:
    `.pageFullHeight`/`.mainFull` CSS mirroring `RolePageWrapper`'s
    `.shellFullHeight`/`.mainFull`, and the same unconditional hook
    call. Confirmed safe to call unconditionally on every already-
    migrated page (not just fullHeight ones): grepped the whole app for
    `--app-vh`, `--keyboard-inset`, and `.keyboard-open` and nothing
    outside `RolePageWrapper.module.css` and `RoleSubHeader.module.css`
    itself references them, so it's a no-op everywhere except pages
    that actually set `fullHeight`.
  - **New, separate, NOT-yet-addressed finding:** while confirming
    nothing else still imports `RolePageWrapper`, `DashboardHeader`, or
    `RoleNav`, found that `DashboardHeader` and `RoleNav` (the two
    pieces `RolePageWrapper` itself is built from) are still used
    DIRECTLY - composed manually, without `RolePageWrapper` - by about
    10 files: `UniversalChatPage.tsx`, `principal/report-cards`,
    `teacher/report-cards`, `student/timetable`, `student/records`,
    `student/profile`, `student/id-card`, `student/announcements`,
    `notifications/NotificationsPageShared.tsx`, `principal/alumni`,
    `principal/students/promote`. None of these ever showed up in any
    `RolePageWrapper` grep this whole session, because they don't use
    `RolePageWrapper` - they use its two building blocks separately.
    This is a genuinely different, previously untracked legacy pattern
    from the migration this file has been tracking - not attempted,
    needs its own dedicated pass and its own recipe (these files may
    have desktop-sidebar-specific behavior via direct `RoleNav` usage
    that a hero+dock migration needs to account for, file by file).
- **`bursar` role: fully migrated, 0 files remaining. This completes
  every full-role RolePageWrapper migration** (bursar's dashboard home
  was already redesigned separately, earlier - see the "de-AI the
  dashboard" entry below; this completes its 13 sub-pages).
  `featureGroups.ts` created; `BursarDashboardClient.tsx` migrated to
  use it (no icons were used directly in the dashboard home's JSX
  outside `FEATURE_GROUPS` this time, unlike most other roles).
  All 13 files migrated: reminders, fees, history, profile, debtors,
  meetings, export, expenses, receipts, settings, claims, payments,
  reports.
  - **New, much bigger finding while scanning this batch - NOT
    fixed, needs its own dedicated pass:** nearly every bursar
    sub-page *other than* profile (reminders, fees, history, debtors,
    export, expenses, receipts, claims, reports) has pervasive
    hardcoded hex colors scattered throughout - not just the one
    `'#10B981'`/`'#EF4444'` profile-page pattern, but dozens of
    instances per file including alpha-tinted variants
    (`'#EF444415'`, `'#10B98120'`, `'#EF444440'`, etc.) used for
    subtle status-badge/error-banner backgrounds, plus at least one
    hardcoded delete-button background (`background:'#EF4444',
    color:'#fff'`) that likely belongs on a `.btn-danger` class if the
    codebase has one. This is a different shape of problem than the
    profile-page bug: that one was one exact copy-pasted template
    fixable with one search-and-replace per file; this is organic,
    varied hex usage that needs the alpha-tinted variants mapped to
    `--success-subtle`/`--danger-subtle` (both already exist in
    `globals.css`) rather than a blind swap, checked file-by-file. Not
    attempted - flagging for a future dedicated session rather than
    risking a rushed, error-prone broad edit.
  - **Addendum (separate pass): the `.input`/`textarea.input` drift
    pattern - a different bug from the hex-color finding above - was
    found and fixed across this same batch.** The canonical drift
    example quoted at the top of this doc (`height: 40, padding: '0
    12px', background: 'var(--input-bg)', border: '1px solid
    var(--input-border)', borderRadius: 8`) turned out to be an exact,
    byte-for-byte "Year" filter input, copy-pasted identically across
    5 files (reminders, history, debtors, receipts, reports) - all
    converted to `className="input"` with a `width: 110, height: 40`
    override to stay compact next to the adjacent term-tab pills. Also
    converted: local `const inp`/`lbl` style-object patterns backing
    real multi-field forms in fees, expenses, export, and settings
    (removed the now-dead `const inp` after conversion in each); a
    `reminders` textarea (there's a real `textarea.input` variant in
    `globals.css` for this); the same profile name/phone input/label
    duplication documented for other roles below, recurring here too;
    and a validation-tinted rejection-reason input in claims (kept its
    custom `borderColor` override rather than reaching for
    `.input-error`, since that's a stronger, different treatment -
    solid `var(--danger)` with `!important` - not what this soft tint
    was going for). Left alone, as a deliberate convention rather than
    accidental drift: several small non-pill "Cancel"/"Close" buttons
    using `var(--input-bg)`/`var(--input-border)`, identical across
    multiple files; dynamic per-school-color selection-state rows; a
    `DOBPicker`-style compact date input; static content/preview boxes
    styled to visually echo an input without being one.
- **The hand-rolled-gradient-button + hardcoded-hex-color profile-page
  bug (`'#10B981'`/`'#EF4444'` instead of `--success`/`--danger`, plus
  a `linear-gradient(135deg, sc, sc+'cc')` "Save Changes" button
  instead of the shared `.btn` class) is now fixed on every profile
  page across all 13 roles - closed out.** Found identical,
  character-for-character, in the profile pages of student, secretary,
  examination, counselor, nurse, coach, librarian, bursar, hostel,
  ict, parent, principal (fixed as each role was migrated or in a
  final cleanup pass). `vice-principal`'s profile page was checked and
  genuinely never had this pattern - confirmed via grep, not a miss.
- **`counselor`, `nurse`, `coach`, and `librarian` roles: fully
  migrated, 0 files remaining (18 files total across the four).**
  Each got the same treatment: `featureGroups.ts` extracted from the
  dashboard-home client (keeping any icons that are also used directly
  in that page's quick-links JSX, not just in `FEATURE_GROUPS`), then
  every `RolePageWrapper` sub-page migrated to `RoleSubHeader`.
  - `counselor/cases/[caseId]/CaseDetailClient.tsx` is a nested detail
    page (one level deeper than the usual sub-page) reached from the
    caseload list, with **three separate `RolePageWrapper` usages**
    (loading state, not-found state, main render with a dynamic
    title from the student's name) - easy to miss with a single grep
    for the JSX tag. All three migrated, and given
    `backHref="/dashboard/counselor/cases"` instead of the default
    dashboard-home fallback, since "back" from a case detail page
    should return to the caseload list.
  - **Every one of these four roles' `profile/ProfileClient.tsx` had
    the exact same hand-rolled-gradient-button + hardcoded-hex-color
    pattern** (`'#10B981'`/`'#EF4444'` instead of the real
    `--success`/`--danger` tokens, plus a `linear-gradient(135deg,
    sc, sc+'cc')` "Save Changes" button instead of the shared `.btn`
    class) - confirmed identical, character-for-character, across
    counselor/nurse/coach/librarian (and student/secretary/
    examination from earlier batches too). All fixed the same way:
    `.btn pressable` + flat `background: sc`, tokens instead of hex.
    **Checked**: `grep -rl "'#10B981'" src/app/dashboard/*/profile/ProfileClient.tsx`
    shows teacher/secretary/examination/counselor/nurse/coach/librarian
    are now clean (fixed as part of their respective migrations), but
    **bursar, hostel, ict, parent, principal, student, and
    vice-principal still have it** - not fixed yet. Note that
    `student/profile/ProfileClient.tsx` doesn't use `RolePageWrapper`
    at all (confirmed - no import), so it was never going to surface
    in a RolePageWrapper-only migration; the hex-color bug is
    independent of wrapper-migration status and needs its own pass
    across whichever profile pages still have it.
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
- [x] ~~**bursar** - 13 files~~ - **done, 0 remaining**
- [x] ~~**examination** - 8 files~~ - **done, 0 remaining**
- [x] ~~**counselor** - 6 files~~ - **done, 0 remaining**
- [x] ~~**nurse** - 5 files~~ - **done, 0 remaining**
- [x] ~~**coach** - 4 files~~ - **done, 0 remaining**
- [x] ~~**librarian** - 3 files~~ - **done, 0 remaining**
- [x] ~~shared components (`DashboardHeader.tsx`, `StaffMeetingsClient.tsx`,
      `UniversalAIPage.tsx`) - 3 files~~ - **done, with a correction:
      `DashboardHeader.tsx` never used `RolePageWrapper` (checked - only
      a comment mentioned it), so nothing to migrate there. The other
      two (`StaffMeetingsClient.tsx`, `UniversalAIPage.tsx`) both take a
      dynamic `role` prop and are shared across 8 and 14 roles
      respectively, so each needed a `role -> FeatureGroup[]` lookup map
      built from every one of those roles' own `featureGroups.ts`,
      rather than a single import. `UniversalAIPage.tsx` also needed
      `fullHeight` support added to `RoleSubHeader` itself (didn't exist
      before) - see the dedicated entry below.**
- [x] ~~**ict** - 1 file~~ - **done, 0 remaining.** Also had a local
      `FEATURE_GROUPS` never extracted (like hostel below) -
      `featureGroups.ts` created.
- [x] ~~**hostel** - 1 file~~ - **done, 0 remaining.** Same gap as ict:
      local `FEATURE_GROUPS` never extracted - `featureGroups.ts`
      created.
- [x] **applications** (`src/app/dashboard/applications/page.tsx`) -
      **checked, confirmed N/A.** This page is explicitly documented in
      its own file header as intentionally NOT using `RolePageWrapper` -
      it's the landing page for identities with `school_id = null`
      (an applicant who may have open applications to several different
      schools at once), so a single-school-branded sidebar doesn't fit.
      Nothing to migrate here.

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
