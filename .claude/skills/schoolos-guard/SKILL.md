---
name: schoolos-guard
description: Guardrails for working on the SchoolOS codebase (Next.js + Supabase + Vercel multi-tenant school management SaaS, repo Echoblaze222/school-os). Use whenever the user asks to build, fix, review, audit, or deploy anything in SchoolOS or mentions Supabase queries, RLS policies, migrations, profiles, roles, fees/invoices, Paystack, parent/teacher/bursar/principal pages, super-admin, or cron jobs. Also use before saying any SchoolOS change is done. Applies to code review, security review, and bug fixing, even for small edits.
---

# SchoolOS Guard

SchoolOS has a history of repeat bugs: wrong table names, broken RLS, trigger conflicts, and queries that fail for real families. This skill makes Claude check those first instead of rediscovering them.

## Before changing code

1. **Read the live schema, not memory.** Confirm table and column names against the real database (Supabase connector, migrations, or generated types). Do not trust a name because it appears in older code. Legacy tables such as `school_fees` and `fee_payments` are dead; the live fee tables are `fee_structures`, `payment_invoices` and `payments`.
2. **Find the existing pattern and reuse it.** Pages use a server `page.tsx` plus a `[Name]Client.tsx`. Styling is CSS Modules with the school's single brand colour. Extend the existing pipeline (for example invoices, receipts) instead of building a parallel one.
3. **Check `references/pitfalls.md`** for any area you touch. Most bugs here are one of those known patterns.

## While changing code

- Server-side identity uses `getUser()`, never `getSession()`.
- Any new table needs RLS enabled plus explicit policies for each role that should touch it. Never leave a table open "for now".
- Use `SECURITY DEFINER` helper functions to avoid recursive policies; before adding a policy, list the existing ones and remove duplicates or conflicts.
- Queries that return one row must tolerate zero or many (parents can have several children). Do not use `.single()` unless a unique index guarantees exactly one row.
- Money paths (Paystack, invoices, setup fees) must be idempotent and verified server-side. See `references/security-review.md`.
- UI rules from the owner: one brand colour (no rainbow or arbitrary per-button colours), minimal copy on settings and upload screens, mobile first with bottom navigation per role.

## Before saying "done"

Do every item you can and say plainly which you could not do:

- Type-check or build passes.
- Each query was checked against the real schema; each new or changed policy was tested as the roles it affects (and as a user from a different school, which must see nothing).
- The change works for the multi-row case (a parent with 2+ children, a school with several terms).
- No `.upsert()`/`.update()` on `profiles.role` or `profiles.school_id`.
- No secrets, tokens or project keys added to code, logs or commits.
- Report what changed, what was verified, and what was not.

## Reviews and audits

For "review", "audit" or "is this secure" requests, run `references/security-review.md` top to bottom and report findings by severity with the file and line. Fix what is clearly safe to fix; ask before changing payment logic, RLS on shared tables, or anything destructive.
