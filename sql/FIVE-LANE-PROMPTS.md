# SchoolOS Sub-Page Redesign - 5 Parallel Lanes

Give each section below to a separate AI session. Each is self-contained - attach `Icons.tsx` and `EMOJI-ICON-MAP.md` (from this same delivery) to every
lane, plus the codebase zip. Do not let two lanes touch the same role.

---

## FILES TO ATTACH TO EACH LANE

Every lane needs all of these, regardless of role:

1. **The codebase zip** (your working copy of `src/`)
2. **`Icons.tsx`** - from `schoolos-redesign-lane0-bursar.zip` → `src/components/Icons.tsx` (106 icons, includes the 14 added for this cleanup)
3. **`EMOJI-ICON-MAP.md`** - the emoji→icon reference table
4. **`DashboardHeader.tsx` + `DashboardHeader.module.css`** and **`RoleNav.tsx` + `RoleNav.module.css`** - from the same zip, `src/components/`. Lanes don't need to *edit* these (already done, shared across all 6 roles), but attach them anyway as the reference implementation of the new visual language - see the primer below.
5. **This document** - just that lane's section, plus the shared context and primer.

Don't attach the other 4 roles' folders - keeps each session focused and avoids one lane accidentally editing another's files.

---

## SHARED CONTEXT - paste this at the top of every lane, before the role-specific part

You're working on SchoolOS, a Next.js (App Router) + Supabase multi-role
school management platform for Nigerian schools. I'm running 5 parallel
AI sessions, each cleaning up one role's sub-pages. You own exactly ONE
role - do not touch other roles' folders.

### The redesign, explained

The 6 main role dashboards were redesigned around a new visual language
before this sub-page pass started. Here's what it actually looks like,
so you can extend it correctly rather than just pattern-match icons:

**Hero gradient band** (top of every dashboard home, and - compact - at
the top of every sub-page via `DashboardHeader`):
```css
background: linear-gradient(180deg, var(--brand), var(--brand-dark));
color: #F6F1E4;
border-bottom: 3px-5px solid var(--brand-2);
```
`--brand` is the school's own primary color (from `schools.primary_color`,
injected per-school at runtime by `SchoolBrandInjector`, defaults to
`#800020` if the school hasn't set one). `--brand-2` is the school's
secondary/accent color (`school_branding.secondary_color`), used for
borders, active states, and the crest/badge - **also runtime-injected,
no static CSS fallback**, so don't be alarmed that you won't find
`--brand-2` defined in `globals.css` - that's expected, it's set by
`SchoolBrandInjector` on page load. Just use `var(--brand-2)` like the
existing components do; don't invent a static value for it.

**Crest / avatar badge** (circular school-branded accent, used top-left
of headers and the home button in nav):
```css
background: conic-gradient(var(--brand-2-light), var(--brand-2), var(--brand-2-light));
color: var(--brand-dark);
border: 2px solid rgba(0,0,0,0.15);
```

**Icon buttons** (theme toggle, back button, notification bell - the
translucent circular buttons in the header):
```css
background: rgba(246,241,228,0.10);
border: 1px solid rgba(246,241,228,0.18);
color: #F6F1E4;
```

**Glass cards** (content cards, list items, panels throughout sub-pages - this part is untouched from before, still correct, just listing it
for completeness):
```css
background: var(--glass-bg);
border: 1px solid var(--glass-border);
box-shadow: var(--glass-shadow);
/* hover: var(--glass-bg-hover) / var(--glass-border-hover) / var(--glass-shadow-hover) */
```

**Status colors** (unrelated to brand - use these for errors/success/warnings, never brand colors): `var(--success)`, `var(--danger)`, `var(--warning)`, `var(--info)`, each with a `-subtle` variant for soft fills.

**Spacing/radius scale** - use the existing tokens, don't hardcode pixel values in new code: `--space-1` through `--space-16` (4px increments up to 16px, then 20/24/28/32/40/48/64), `--radius-xs` (4px) through `--radius-2xl` (24px), `--radius-full` for pills/circles.

**Global card/button classes - use these instead of ad-hoc inline styles.**
This is the "deeper" part of the redesign: on your role's key pages
(the ones with a summary/totals panel, or hand-rolled buttons), replace
custom inline-styled cards and buttons with the classes that already
exist in `globals.css` - don't invent new styling, use what's there:

```css
.glass-card       /* base card: var(--glass-bg) + var(--glass-border), blur, hover lift */
.glass-card-flat  /* same but no hover lift, for static panels */
.btn .btn-primary   /* brand-gradient pill button, use for the main CTA on a page */
.btn .btn-secondary /* glass pill button, use for secondary actions */
.btn .btn-danger    /* soft-red pill button, for destructive actions */
.btn-sm             /* modifier: shorter/smaller - combine with the above */
```
Usage pattern (straight from the already-shipped main dashboard):
```tsx
<div className="glass-card" style={{ padding: 16, borderRadius: 'var(--radius-xl)' }}>
  <GaugeStat label="Collection rate" value={pct} isPercent
    color="var(--brand-2, var(--brand))" caption="this term" />
</div>
<button className="btn btn-primary" onClick={submit}>Save</button>
```
Where a sub-page shows a headline percentage or count (collection rate,
attendance rate, completion rate, pass rate, etc.), wrap it in a
`glass-card` and render it through `GaugeStat` (`src/components/GaugeStat.tsx`,
attached) instead of a plain number - that's the actual visual signature
of the redesign, not just the color swap. See `DebtorsClient.tsx` in the
Bursar delivery for a full worked example (turned a flat "total
outstanding" text block into a `glass-card` + `GaugeStat` collection-rate
ring). Also replace any hardcoded status colors (`#EF4444`,
`'#EF444415'` etc. for errors) with `var(--danger)` / `var(--danger-subtle)` - same for success/warning/info - rather than raw hex, so theme
switching and future palette tweaks keep working.

Don't force this everywhere - a settings toggle or a simple list item
doesn't need a gauge. Use judgment: apply it to the 1-3 pages per role
that show a genuine headline metric (the kind of page that already has
a "totals" or "summary" block at the top).


**Known token issues:**
- `var(--burgundy)` / `var(--burgundy-subtle)` / etc. are genuinely
  undefined (unlike `--brand-2`, nothing ever sets them) - this is the
  bug you're fixing by replacing them with `var(--brand)` equivalents.
- `globals.css` **has already been fixed** (the old hardcoded-violet
  root tokens `--glass-bg-active`/`--glass-border-hover`/`--input-focus`
  now correctly reference `var(--brand-subtle)`/`var(--brand-border)`/
  `var(--brand-glow)`). Use the `globals.css` included in this delivery
  (`src/app/globals.css`) - don't edit it further, just make sure
  you're working from this version, not an older copy.

**What's already done centrally - do not redo this:**
- `src/components/DashboardHeader.tsx` and `src/components/RoleNav.tsx`
  were already redesigned to match the new hero-header/dock visual
  language (brand gradient band, `var(--brand-2)` accents). Every
  sub-page already gets this automatically via `RolePageWrapper` - you
  don't need to touch header/nav chrome on individual pages.
- `src/components/Icons.tsx` has 106 icon components in a consistent
  24x24 stroke style. 14 were added specifically for this cleanup
  (CrownIcon, BellOffIcon, StatusDotIcon, BanIcon, BankIcon,
  StethoscopeIcon, FolderIcon, SparkleIcon, BulbIcon, TargetIcon,
  HandshakeIcon, CalculatorIcon, PartyPopperIcon, WaveIcon). Use what's
  there before inventing a new icon; only add a new one, matching the
  exact same style (`ic()` helper, 24x24 viewBox, strokeWidth 1.75), if
  nothing in the file fits.
- `src/app/dashboard/*/notifications/NotificationsPageClient.tsx` is
  identical across all 6 roles and has already been fully converted - don't touch it.

**Your job:** go through your role's sub-pages and:
1. Replace every emoji with the matching icon from `Icons.tsx`, per
   `EMOJI-ICON-MAP.md` (attached). If you hit an emoji not in the map,
   pick the closest semantic match from existing icons, or add one new
   icon in the established style if nothing fits.
2. Fix leftover old-brand-color references in any file you touch:
   - `var(--burgundy)`, `var(--burgundy-subtle)`, `var(--burgundy-light)`,
     `var(--burgundy-glow)` are **undefined** in `globals.css` - they
     silently no-op. Replace with `var(--brand)`, `var(--brand-subtle)`,
     `var(--brand-light)`, `var(--brand-glow)` (all properly defined,
     and dynamically overridden per-school by `SchoolBrandInjector`).
   - Hardcoded `#7C3AED` (old violet) should become `var(--brand)`
     (solid), `var(--brand-subtle)` (soft fill, ~12% alpha),
     or `var(--brand-border)` (~30% alpha) depending on context - don't string-concat an alpha suffix onto `var(--brand)`, it
     produces invalid CSS.
   - `school?.primary_color ?? '#7C3AED'` fallback patterns: change
     the fallback to `'#800020'` (the actual app-wide default brand
     color) - `'#7C3AED'` is stale.
   - A stray `className="burgundy-glow-orb"` also appears in some AI
     pages and is undefined in `globals.css` (silently renders nothing).
     If you find it in your role, replace with an inline absolutely
     positioned blurred circle using `var(--brand)` - see the fix
     pattern in `AIBursarClient.tsx` for reference.

**Known exceptions - do NOT force these into icons:**
- Native `<select><option>` elements can't render SVG/JSX - strip the
  emoji to plain text there, nothing else to do.
- Any string passed into a plain-`string`-typed prop or state (toast
  messages, `alert()`-style text, anything that isn't rendered as JSX) - strip the emoji to plain text, don't try to inject a component.
- **Chat reaction pickers** (❤ 😂 😮 😢 👍 😊 👏 🔥 appearing in
  message/reaction UI) - leave these as real emoji. They're user-facing
  message reactions like WhatsApp/iMessage, not UI chrome. Converting
  them would break a feature people already recognize.

**Before touching ANY file - verify it's actually live:**
This codebase has real dead/duplicate files (found 5+ in the Bursar
pass already: components built, never wired into `page.tsx`, sitting
unused alongside the real one - sometimes byte-identical duplicates,
sometimes with broken CSS imports). Before editing `SomeClient.tsx`,
open the sibling `page.tsx` in the same folder and confirm it actually
imports that exact file. If you find a orphaned/dead file, don't spend
time polishing it - note it in your summary and move on. If two files
in the same folder look like duplicates, `diff` them before deciding
which is live.

**If you hit ambiguous data/schema issues** (e.g. a page reading from a
table that seems inconsistent with how sibling pages in the same role
query the same data), don't guess a fix - flag it in your summary with
the specific file/table names and move on. Data-correctness fixes need
sign-off, this pass is about visual/icon consistency only.

**Deliverable:** mirror the `src/app/...` path structure so files can be
dropped straight into the project. Don't touch files outside your role's
folder except where explicitly noted above (Icons.tsx additions only).
End with a short summary: files converted, any dead files found, any
brand-token fixes made, anything flagged rather than fixed.

---

## LANE 1 - Principal (23 files)

Role folder: `src/app/dashboard/principal/`

Files with emoji, by count:
```
25  chat/PrincipalChatClient.tsx
12  transfers/PrincipalTransfersClient.tsx
11  students/promote/PromoteClient.tsx
 8  staff/StaffClient.tsx
 8  students/StudentsClient.tsx
 8  assignments/AssignmentsClient.tsx
 7  ai/AIPrincipalClient.tsx
 7  classes/PrincipalClassesClient.tsx
 7  live/LiveClient.tsx
 6  students/transfer/page.tsx
 5  ai/AiClient.tsx
 5  notices/NoticesClient.tsx
 4  PrincipalDashboardClient.tsx
 4  codes/CodesClient.tsx
 3  fees/PrincipalFeesClient.tsx
 2  results/PrincipalResultsClient.tsx
 2  results/ResultsClient.tsx
 2  analytics/AnalyticsClient.tsx
 1  alumni/PrincipalAlumniClient.tsx
 1  announcements/AnnouncementsClient.tsx
 1  reports/ReportsClient.tsx
 1  teachers/TeachersClient.tsx
 1  transfers/pending/PendingTransfersClient.tsx
 1  subscriptions/SubscriptionClient.tsx
```
Flag to check first: `ai/AIPrincipalClient.tsx` vs `ai/AiClient.tsx`
(same folder, two AI-chat-shaped files - verify which `page.tsx` in
`principal/ai/` actually imports before touching either) and
`results/PrincipalResultsClient.tsx` vs `results/ResultsClient.tsx`
(same suspicion). `PrincipalDashboardClient.tsx` is the already-redesigned
main dashboard - it has 4 leftover emoji, do a quick sweep on it too.

---

## LANE 2 - Teacher (19 files)

Role folder: `src/app/dashboard/teacher/`

Files with emoji, by count:
```
11  results/PostResultsClient.tsx
10  notes/NotesClient.tsx
 9  syllabus/SyllabusClient.tsx
 9  live/LiveClient.tsx
 9  assignments/AssignmentsClient.tsx
 8  quizzes/QuizzesClient.tsx
 7  TeacherDashboardClient.tsx
 7  grades/page.tsx
 6  ai/AiClient.tsx
 6  submissions/page.tsx
 3  timetable/TimetableClient.tsx
 3  results/ResultsClient.tsx
 2  submissions/SubmissionsClient.tsx
 2  classes/ClassesClient.tsx
 2  announcements/AnnouncementsClient.tsx
 2  results/page.tsx
 1  layout.tsx
 1  attendance/AttendanceClient.tsx
 1  profile/ProfileClient.tsx
```
Flag to check first: `results/PostResultsClient.tsx` vs
`results/ResultsClient.tsx` vs `results/page.tsx` - three files in one
folder, verify which is actually routed before touching any.
`submissions/page.tsx` having 6 emoji directly (not in a Client file) is
unusual - check whether it's a server component rendering emoji directly
or whether it also has a sibling Client file being bypassed.
`teacher/layout.tsx` has 1 emoji - this is the role layout that wraps
every teacher sub-page, so it's worth a quick look even though layouts
weren't part of the main shell redesign scope.

---

## LANE 3 - Student (21 files)

Role folder: `src/app/dashboard/student/`

Files with emoji, by count:
```
43  chat/[roomId]/ChatRoomClient.tsx   ⚠ mostly chat reactions - see exception rule above, don't strip those
13  ChatRoomClient.tsx (top-level, NOT in chat/[roomId]/ - verify this isn't a dead duplicate of the one above)
13  ai/AITutorClient.tsx
12  quizzes/[id]/QuizTakeClient.tsx
 9  notes/NotesClient.tsx
 9  assignments/AssignmentsClient.tsx
 8  quizzes/QuizListClient.tsx
 8  live/LiveClient.tsx
 7  classes/PrincipalClassesClient.tsx   ⚠ a PRINCIPAL-named file living in student/classes/ - almost certainly a stray copy, verify routing carefully before touching
 6  chat/ChatListClient.tsx
 6  syllabus/SyllabusClient.tsx
 5  StudentDashboardClient.tsx
 5  ai/AiClient.tsx
 5  alumni/StudentAlumniClient.tsx
 5  classes/ClassesClient.tsx
 5  schedule/ScheduleClient.tsx
 4  results/ResultsClient.tsx
 3  leaderboard/LeaderboardClient.tsx
 2  alumni/AlumniClient.tsx
 2  quizzes/QuizzesClient.tsx
 1  meetings/page.tsx
```
Flag to check first (this role has the most duplicate-file smell of all
5): `ChatRoomClient.tsx` appears at both top-level and under
`chat/[roomId]/` - diff them and confirm which `page.tsx` imports which
before editing either. `ai/AITutorClient.tsx` vs `ai/AiClient.tsx` - same pattern as principal/teacher, check routing. `classes/ClassesClient.tsx`
vs `classes/PrincipalClassesClient.tsx` - the second name strongly
suggests a copy-paste leftover from the principal role; verify before
touching. `quizzes/QuizListClient.tsx` vs `quizzes/QuizzesClient.tsx` - check both. Given how many suspects are in this role, do the routing
audit for the whole folder FIRST, before starting any emoji conversion,
so you don't waste time polishing dead files.

---

## LANE 4 - Parent (6 files)

Role folder: `src/app/dashboard/parent/`

Files with emoji, by count:
```
9  fees/FeesClient.tsx
5  ParentDashboardClient.tsx
4  assignments/AssignmentsClient.tsx
3  leaderboard/LeaderboardClient.tsx
2  fees/PaymentClaimClient.tsx
1  results/ResultsClient.tsx
```
Note: `fees/FeesClient.tsx` and `leaderboard/LeaderboardClient.tsx` were
both recently bug-fixed (parent-child linking source of truth, leaderboard
filter) in a separate pass - the versions in your zip should already have
those fixes; do the emoji pass on top of them, don't revert any logic
changes. Smallest lane of the 5 - once done, you're free to help audit
another lane if the person running this wants a second pass on a bigger
one.

---

## LANE 5 - Secretary (15 files)

Role folder: `src/app/dashboard/secretary/`

Files with emoji, by count:
```
14  documents/DocumentsClient.tsx
12  transfers/TransfersClient.tsx
 9  settings/SettingsClient.tsx
 9  codes/CodesClient.tsx
 8  SecretaryClient.tsx
 6  ai/AISecretaryClient.tsx
 6  applications/ApplicationsClient.tsx
 6  students/StudentsClient.tsx
 5  records/RecordsClient.tsx
 5  library/LibraryClient.tsx
 5  profile/ProfileClient.tsx
 5  clinic/ClinicClient.tsx
 5  calendar/CalendarClient.tsx
 5  admissions/AdmissionsClient.tsx
 1  records/page.tsx
```
Note: `clinic/ClinicClient.tsx` was recently bug-fixed (search UX) in a
separate pass - do the emoji pass on top of the current version, don't
revert it. `ai/AISecretaryClient.tsx` has the same `burgundy-glow-orb`
undefined-class issue already found and fixed in the Bursar AI page - apply the same fix pattern (inline absolutely-positioned blurred circle
using `var(--brand)`) here too.
