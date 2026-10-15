# SchoolOS security review checklist

Work top to bottom. Report each finding with severity, file and line, and the fix.

## 1. Authentication
- Server code uses `getUser()`, not `getSession()`.
- Role and school come from the database, not from client input, cookies or URL params.
- Super-admin routes check `platform_admins.is_super` on the server.

## 2. Tenant isolation (most important)
- Every table with school data has RLS enabled and a policy scoped by school.
- Test as a user from school A reading school B's rows: it must return nothing, for reads and writes.
- Service-role keys appear only in server code, never in client bundles or `NEXT_PUBLIC_*`.

## 3. RLS quality
- List the policies on each touched table; look for `USING (true)`, missing `WITH CHECK`, duplicates, and conflicts.
- Role-specific access: a student sees their own data, a parent sees their own children only, a teacher sees their classes, bursar and principal see school finance.
- Helper functions are `SECURITY DEFINER` with a fixed `search_path`.

## 4. Payments (Paystack)
- Webhook verifies the HMAC signature before doing anything.
- Idempotent: the same event delivered twice must not credit twice (check a unique reference).
- Amount and subaccount split are computed server-side, never taken from the client. Split is 97% school, 3% platform.
- Setup-fee attempts are recorded in `school_registration_attempts`; abandoned unpaid registrations are cleaned by the cron job.

## 5. Inputs, uploads and storage
- Validate and bound inputs server-side. Storage buckets exist and have policies; file type and size are limited.
- Lock screen and auto-lock: password required to unlock, session kept alive, no sensitive data cached in plain localStorage.

## 6. Secrets and logs
- No tokens, keys or personal data in code, commits, logs or error messages. Cron routes require their secret.

## 7. Report format
Severity (critical / high / medium / low), location, what is wrong, how to fix, whether it was fixed and verified.
