# C1 - Account takeover through activation codes

Branch: `security/c1-activation-credentials`  
Status: **implemented, NOT merged, database migration NOT applied.** For review.

## The problem

`profiles.default_code` was three things at once: a visible identifier (shown on ~50 screens),
the `code-signin` login identifier, and the only secret `/api/auth/first-login` needed to set a
password. Every signed-in user in a school can read every profile in that school, so a student
could read a new teacher's, bursar's or principal's code and take the account over before its
owner activated it. The same code was also the parent-to-child link credential, so any parent
could read any child's code.

The code format made it worse as a secret: `XXX-YYYY-NNNN` is a 3-letter name prefix, the year
and a 4-digit per-school sequence, i.e. a few thousand guesses per school per year.

## The fix (what this PR does)

| Concern | Before | After |
|---|---|---|
| Visible identifier / `code-signin` | `default_code` | **unchanged** (`default_code` semantics are not touched) |
| Activation secret | `default_code` | random single-use token `ACT-XXXXX-XXXXX-XXXXX-XXXXX` (100 bits), table `activation_credentials` |
| Parent-to-child secret | child's `default_code` | random per-student link code `LNK-XXXX-XXXX-XXXX-XXXX` (80 bits), table `student_link_codes` |

Activation token properties:

- only its SHA-256 hash is stored; plaintext is returned once to the admin who issued it;
- single use (atomic claim in one SQL statement), expires (default 7 days), tied to exactly one profile;
- one live token per account (issuing a new one supersedes the old);
- refused once the account is past `start`/`stage_1_pending`;
- revoked automatically by a trigger if that user's password changes for any reason;
- rate limited by IP and by token **hash** (never by plaintext);
- every failure returns the identical message and status.

Both tables have RLS enabled with **no policies** and all grants to `anon`/`authenticated` revoked.
The functions are executable by `service_role` only.

## Files

New:
- `sql/migrations/2026-09-20-c1a-activation-credentials-and-link-codes.sql` (additive, apply first)
- `sql/migrations/2026-09-20-c1b-contract-drop-client-parent-link-insert.sql` (apply after deploy)
- `src/lib/credentials.ts`
- `src/app/api/students/link-code/route.ts`
- `src/components/LinkCodesPage.tsx`, `src/app/dashboard/principal/link-codes/page.tsx`, `src/app/dashboard/secretary/link-codes/page.tsx`
- tests: `src/lib/__tests__/credentials.test.ts`, `src/app/api/auth/__tests__/first-login.test.ts`, `src/app/api/parent/__tests__/link-child.test.ts`, `src/app/api/students/__tests__/link-code.test.ts`

Changed:
- `src/app/api/auth/first-login/route.ts` (requires the activation token; `default_code` no longer accepted)
- `src/app/api/secretary/create-user/route.ts`, `src/app/api/principal/enrol-with-role/route.ts` (issue a token; return it as `code`; email carries it)
- `src/app/api/staff-codes/regenerate/route.ts` (un-activated account: issue a new token; activated account: unchanged rotation)
- `src/app/api/parent/link-child/route.ts` (link code, server-side, same-school enforced in SQL)
- `src/components/LinkChildPrompt.tsx` (calls the server route; no more browser reads of student profiles or inserts into `parent_student_links`)
- `src/app/dashboard/{principal,secretary}/featureGroups.ts` (adds the "Parent link codes" entry)

Not touched (by instruction): notifications / H3, the internal push secret / H6, the C4 leaderboard overloads.

## API contract note (read this)

To keep every existing enrolment screen working without editing ~8 large UI files, the create-user
and enrol-with-role routes still return the value to share with the new person in the field `code`.
It is now the **activation token**. The account's permanent identifier is returned as `defaultCode`.
The existing success screens, the bulk table and the welcome email all show `code` as "the code to
share", which is now correct. The same applies to `Regen` in the Codes list for an un-activated account.

Known UI roughness (deliberately not fixed here, to keep this PR to the security change):
- On the Codes list, `Regen` on an un-activated account shows the new activation token in the row's
  code chip until the page is reloaded (the server never returns it again).
- The Codes list's "Copy" button copies `default_code`; giving that to a new user now yields a clear
  "Invalid or expired activation code" message.
- Login page label still says "Access Code" on the New User tab, and the info banner on the Codes
  page still says every user has one login code.

## Deploy order

1. Apply migration **C1-A** (additive; the currently deployed code keeps working).
2. Merge and deploy this PR.
3. In the app, confirm: create a user, activate it with the emailed/shown token; generate a parent link code and link a child as a parent.
4. Apply migration **C1-B** (drops the browser's ability to insert `parent_student_links`).

Between step 1 and step 2 the old first-login still accepts `default_code`; the fix is live only after step 2.

## Verification performed (nothing applied to production)

The migration SQL and a test script were run inside one transaction on the live database that was
rolled back by a final exception (the migration was not applied).

| Test | Result |
|---|---|
| Issue token for un-activated account, 168h expiry | pass |
| Wrong token | denied |
| Right token, wrong school | denied, token stays unused |
| Right token, right school | claims the right profile |
| Reuse of a claimed token | denied |
| Expired token | denied |
| Issue for an already-activated account | blocked (55000) |
| Re-issue supersedes; exactly one live token | pass |
| Password change on the auth user revokes an unused token | pass (trigger; verified on a real auth user) |
| Unchanged password does not revoke | pass |
| Link code resolves only in its own school | pass |
| Parent presenting a normal default_code as link credential | denied |
| Non-parent presenting a valid link code | denied |
| Parent, same school, valid code | linked |
| Expired link code | denied |
| Issuing a link code for a non-student | blocked |
| `authenticated` / `anon` SELECT on both tables | permission denied |
| `authenticated` / `anon` EXECUTE on the functions | permission denied |
| `service_role` EXECUTE | allowed |

Not verifiable through the tools I have: the trigger firing **as `supabase_auth_admin`** (the role
Supabase Auth uses). To remove the risk that a permission check could ever make a password update
fail, the trigger function is explicitly granted to `supabase_auth_admin`. Worth one manual
password-reset test right after applying C1-A.

Application tests (vitest, run by CircleCI on this branch) cover: valid activation, wrong token,
expired token, reused token, token for another account, already-activated accounts, cross-school,
replay, legacy `default_code` shapes rejected, no token/hash in any response, password-failure
release, rate limiting, input validation; link-child: parent same school allowed, parent using a
student's `default_code` denied, cross-school denied, expired/rotated denied, non-parent roles
denied, identical failure responses, rate limiting; link-code issuance: role and school checks,
hash-only downstream, audit without the code.

## Findings that changed the plan (please read)

1. **The "5 currently vulnerable accounts" were not vulnerable.** My earlier count matched on
   onboarding stage only. All five are orphan June test profiles with **no school and no
   `default_code`**, so `first-login` could never find them. They also have no auth user. Of 39
   profiles only 7 have an auth user. So there is nothing to re-issue for them; they are
   candidates for cleanup instead. The vulnerability itself was real (any code-bearing account in
   `stage_1_pending` was takeover-able by a same-school user); currently no such account exists.
2. **`stage_1_pending` means "not activated" for accounts made by create-user/enrol-with-role**, but
   `code-signin`'s comment claims it means "password already set". Both cannot be true. Registered
   principals (`schools/register`) do pick their own password yet also sit in `stage_1_pending`,
   so under the old code anyone with their `default_code` could have reset their password. They
   need no token (they already have a password); they are simply no longer takeover-able.
3. `super-admin/create-school` creates the principal in `stage_1_pending` **with a `Math.random`
   temporary password** (about 31 bits), returns it in the API response, emails it, and stores it in
   plaintext in a `notifications` row. This is a separate finding (N1), not fixed here.
4. `src/app/api/admin/create-user/route.ts` is a near-copy of `super-admin/create-school` (same
   header comment, creates a school). Looks like a mis-pasted file; worth confirming it is intended.
5. `access-code-generator.ts` claims the sequence format keeps codes "never guessable". It does
   not, which is why `default_code` can no longer be a secret.
6. Several pages pass `select('*')` profile rows (including `pin_hash`, `nin`, ...) to client
   components. That is C2.

## What stays open (belongs to other phases)

- C2: `default_code` is still readable by every same-school user. That is now harmless as a
  credential, but it is still a login identifier that `code-signin` maps to an email.
- C3: the browser INSERT policy on `parent_student_links` is only removed by migration C1-B; C3 re-verifies.
- C4: leaderboard overload ambiguity, untouched.
- H7: `default_code` is still written to `portal_audit_log` (the activation token is not).
- H3/H6: untouched pending PR #5.
