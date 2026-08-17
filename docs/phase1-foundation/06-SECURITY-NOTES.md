# SchoolOS — Phase 1 Security Pass

Adversarial read of the live code, not a checklist audit. Ranked by
severity. This is descriptive (what's wrong and why) and remediation-only —
no exploit tooling, since the goal is fixing your own app.

## Critical: principal account takeover on new schools

`src/app/api/schools/register/route.ts:173`

```
const defaultCode = `SCH-${Date.now().toString().slice(-6)}`
```

The very first account on a new school (the principal, created at
registration) gets an access code derived from the server's clock at the
moment of signup, not from a cryptographically random source. The last six
digits of `Date.now()` repeat on a ~16.7-minute cycle, so anyone who knows
roughly when a school registered (a public "recently joined" list, a
timestamp in a marketing screenshot, or just guessing a plausible signup
window) is working with a search space in the low hundreds of thousands,
not the ~2 billion+ a real random code should force.

That code is then usable at `src/app/api/auth/first-login/route.ts`, which
has **no rate limiting at all** — it accepts unlimited POSTs with different
`code` guesses, and a correct guess lets the caller set that principal
account's password and immediately get the returned email to sign in. There
is no CAPTCHA, no attempt counter, no lockout, no delay.

Put together: a weak, guessable code plus an unthrottled endpoint that
grants full account control on a correct guess is a real path to taking
over a school's principal account before the real principal ever logs in.
This is worse than the 4-digit-code issue your own comments say was already
fixed once in `secretary/create-user` — that fix didn't reach this route.

**Fix:** generate `defaultCode` here the same way `admin/create-user` and
`staff-codes/regenerate` already do (`crypto.randomBytes`, not `Date.now()`),
and add rate limiting + attempt throttling to `first-login` (and
`code-signin`) the same way `ai/chat/route.ts` already rate-limits, via the
existing `ai_check_rate_limit` RPC pattern or a dedicated one keyed by IP
and by code. Both routes should also fail closed with a generic error after
N attempts rather than confirming/denying code existence indefinitely.

## Medium: role enum drift is also a permission gap, not just a bug

Covered in the audit (§2), restated here because it's a security issue too:
`'librarian'` and `'nurse'` are accepted by two creation routes but aren't
in `UserRole`. Any code elsewhere that does `if (role === 'teacher' ...)`
style checks without an explicit librarian/nurse branch may silently fall
through to a default-deny (safe but broken) or, worse, a default-allow if
any such check is written as `role !== 'student' && role !== 'parent'`
instead of an explicit allow-list. I didn't find an instance of the
dangerous pattern in the routes I checked, but it's worth a repo-wide grep
before Phase 2 adds more roles on top of an already-inconsistent base.

## Good, worth preserving as the pattern going forward

These aren't findings, they're the baseline Phase 2 should copy rather than
reinvent:

- `secretary/create-user` and `staff-codes/regenerate` both do
  server-side role verification, a role-escalation allow-list check (not
  just a UI dropdown restriction), same-school scoping on every query, and
  writes through the service-role client rather than trusting client input.
- `cron/*` and `internal/push-on-notification` routes are correctly
  protected by a bearer secret (`CRON_SECRET` / `x-internal-secret`)
  checked before any work happens.
- Payment webhooks use HMAC signature verification with idempotency
  protection (per existing project notes).
- RLS is enabled with same-school scoping as the documented baseline in
  `SECURITY_RLS_AUDIT_AND_POLICIES.sql`.

The new `access_code_applications` table and routes in this phase follow
the same pattern: password hashed server-side before the row is ever
written, no auth account created until an ICT reviewer explicitly approves,
and the review-read policy scoped to same-school ICT/principal/secretary
only. That public-facing submission endpoint should get the same rate
limiting called out above before it ships, since it's a second public entry
point that writes to the database from an unauthenticated caller.

## Note on the "—" character

Checked every `.tsx`/`.ts` file for em dashes in actual rendered UI text
(JSX children, `placeholder`, `label`, `title`, `alt`) — found none. The
182 occurrences that exist are all in code comments and in one AI
system-prompt string (`api/ai/chat/route.ts`), neither of which a user
ever sees on screen. Nothing to change here unless you want comments
restyled too, which I left alone since it's not user-facing.
