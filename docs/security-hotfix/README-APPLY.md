# Hotfix: principal account takeover via weak access code + unthrottled login

## What this fixes

1. `schools/register/route.ts` generated the new principal's access code
   from `Date.now()` (predictable, repeats every ~16.7 minutes). Now uses
   the same `crypto.randomBytes` generator already used in
   `admin/create-user` and `staff-codes/regenerate`.
2. `first-login` and `code-signin` accepted unlimited guesses with no
   throttling. Both now check a DB-backed rate limit before doing the
   account lookup: max 15 attempts/minute per IP, max 8 attempts/5min per
   specific code guessed. Limiter fails closed (a limiter outage returns
   a 503, not an unthrottled pass-through), since these two endpoints can
   set a password from nothing but a guessed code.

## How to apply

1. Run `hotfix-01-rate-limit-schema.sql` against your live Supabase
   database (adds `rate_limit_attempts` table + `check_rate_limit`
   function, nothing else - does not touch `profiles` or any existing
   table).
2. Copy the 4 files under `patched-files/` into the matching paths in
   your repo, overwriting the originals:
   - `src/app/api/schools/register/route.ts`
   - `src/app/api/auth/first-login/route.ts`
   - `src/app/api/auth/code-signin/route.ts`
   - `src/lib/rateLimit.ts` (new file)
3. Deploy.

No schema changes to `profiles`, no changes to the access code *format*
(still `PREFIX-XXXXXXXX`), so nothing else in the app needs to change - existing valid codes for already-created accounts keep working exactly as
before. This only affects codes generated from now on, and how many
guesses an attacker gets.

## One more thing I found while in this code, not yet fixed

`super-admin/create-school/route.ts` generates its access code with
`Math.random()` (not cryptographically secure), not `Date.now()`, so it's
not the same critical bug - with a 33-character charset and 6 characters,
that's about 1.29 billion combinations, and it's now also protected by the
same throttling on `first-login`/`code-signin`. But `Math.random()` is
still not a secure source for anything credential-like. Worth swapping to
`crypto.randomBytes` for consistency the next time that file is touched - didn't fix it now since it wasn't part of what you asked for and I'd
rather you say yes to that one explicitly too.

## Not fixed, flagged only

`schools/register` and any other public route that writes to the database
from an unauthenticated caller should eventually sit behind the same
`checkRateLimit` helper for basic abuse protection (someone spamming school
signups), not just the code-guessing endpoints. Out of scope for this
hotfix since it's not an account-takeover path, just noting it while the
rate-limit infrastructure is fresh in mind.
