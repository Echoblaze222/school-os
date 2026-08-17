# Phase 1 Foundation — Lane 1 deliverable package

1. `01-AUDIT.md` — written audit (no code changes), including two real
   findings: a dead duplicate `sql/src/` tree, and a role-enum/reality
   mismatch already live in production code.
2. `02-identity-appointments-schema.sql` — appointment types, org
   hierarchy (departments), appointments, committees, and the
   access-code self-service application table, with RLS. Not yet run
   against the live database — see the note at the top of the file.
3. `03-permission-matrix.md` — the §25 role × action matrix every
   Phase 2 lane implements against, plus one open item flagged for you
   to confirm rather than decided unilaterally (Principal/Bursar
   admin-issued-only exclusion).
4. `04-appointments-types.ts` — TypeScript types/config mirroring the
   SQL, ready to drop into `src/lib/supabase/`.
5. `05-design-tokens-additions.css` — the missing button/link/table/
   modal/chart tokens, derived from your existing brand palette. Meant
   to be appended to `globals.css`, not to replace it.
6. `06-SECURITY-NOTES.md` — adversarial pass. Leads with one critical,
   real finding: a predictable access code plus an unthrottled endpoint
   that together allow principal-account takeover on newly registered
   schools.

## What I didn't have

The actual source spec (`SCHOOL_OS_ROLE_HOSTEL_ICT_EXPANSION_UPDATE_PROMPT_BRANDED.md`)
wasn't attached, only `PHASE-1-FOUNDATION.md`, which summarizes it. The
appointment titles, scope shapes, and matrix rows above are reasoned
defaults built from your live code (what routes already accept) plus that
summary, not transcribed from the numbered sections it references. If you
have that source file, send it and I'll reconcile this package against it
line by line before Phase 2 starts.

## Before Phase 2 starts

- Fix the critical finding in `06-SECURITY-NOTES.md` first — it's
  independent of everything else in this phase and shouldn't wait.
- Decide what to do with the dead `sql/src/` tree.
- Confirm the Principal/Bursar admin-issued-only exclusion.
- Review the SQL against the live Supabase schema before applying (this
  repo has no migration history to diff against, per the audit).
