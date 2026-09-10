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

- `src/components/RoleSubHeader.tsx` - added optional `onBack` callback,
  needed for multi-step/wizard pages. Backward compatible.
- `teacher`: `featureGroups.ts` created; `TeacherDashboardClient.tsx`
  migrated to use it.
- `teacher/quizzes/QuizzesClient.tsx` - fully migrated (list, create,
  add-questions, preview/edit) - both the wrapper and the input/button/card
  drift. Use this file as the reference example for future migrations.

## Remaining (RolePageWrapper usages by role, at time of writing)

- [ ] **principal** - 18 files
- [ ] **teacher** - 15 files remaining (quizzes done)
- [ ] **student** - 14 files
- [ ] **secretary** - 14 files
- [ ] **bursar** - 13 files
- [ ] **examination** - 8 files
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
recipe above applies to all of them.

## Not yet started

- The `--error` CSS variable bug (see above)
- Auditing the other role dashboards' home screens themselves (only
  `student` has been spot-checked so far, in a separate earlier pass - see
  git history for "clean(student dashboard)")
- The ~14 fully-custom-header pages (neither RolePageWrapper nor
  RoleSubHeader) - not inventoried yet, `grep -rl "className={styles.header}\|<header" --include="*.tsx" src/app/dashboard`
  is a rough starting point, not a precise list
