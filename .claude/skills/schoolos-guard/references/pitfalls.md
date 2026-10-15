# Known SchoolOS pitfalls

Each entry is something that has already broken in this codebase.

## Contents
- Profiles and the signup trigger
- PostgREST embeds and single-row queries
- Fees and payments tables
- Single-row config tables
- RLS
- Super-admin
- PWA and service worker
- Vercel limits
- Dead code

## Profiles and the signup trigger
A `handle_new_user` trigger creates a blank `profiles` row when an auth user is created. A separate guard trigger blocks `UPDATE`s to `role` and `school_id` on that row. So `.upsert()` or `.update()` for profile creation fails. Instead delete the trigger's row first, then do a plain `.insert()`.

## PostgREST embeds and single-row queries
- An embed such as `profiles!student_id(...)` comes back under the plain table name (`row.profiles`), never `row['profiles!student_id']`.
- `.single()` throws when there are zero or multiple rows ("Cannot coerce the result to a single JSON object"). Parent pages with multi-child families broke this way. Use `.maybeSingle()` or handle arrays.

## Fees and payments tables
Live: `fee_structures`, `payment_invoices`, `payments`. Legacy and dead: `school_fees`, `fee_payments`. Individual (single-student) charges reuse the same invoice, payment and receipt pipeline.

## Single-row config tables
`trial_config`, `installment_config`, `setup_fee_config` must each hold exactly one row. Seed scripts once inserted duplicates and crashed Settings. Keep unique indexes in place and make seeds idempotent.

## RLS
- Helper functions must be `SECURITY DEFINER`; direct self-referencing policies caused infinite recursion on the super-admin tables.
- Past sessions left duplicate and conflicting policies (one table had 15). Audit existing policies before adding more.
- Tables that were found open or missing policies include schools, payment claims, quiz tables, notifications, class and subject tables, expenses, medical and clinic records, teacher profiles. Treat every table as suspect until its policies are read.

## Super-admin
The real owner account lives in `platform_admins` (with a PIN), not in `profiles.role`. Gate server-side on `platform_admins.is_super`; never trust a client-supplied flag. Everything lives under `/super-admin/*` with a shared layout and shell. The old `/admin` panel is retired and redirects.

## PWA and service worker
A stale service worker can leave an open tab running old JS, so menus and buttons look dead. A `controllerchange` reload handler exists in `layout.tsx`. If a UI bug appears only on a long-open device, suspect this before the component.

## Vercel limits
Puppeteer fails on Vercel. PDFs (report cards) use `@react-pdf/renderer`.

## Dead code
Do not reintroduce vestigial Basic/Premium/Elite plan tiers; billing is a setup fee plus per-student, per-term tiers by student count. Normalise term values to the existing enum rather than inventing strings.
