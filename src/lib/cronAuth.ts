// src/lib/cronAuth.ts
//
// Shared, fail-closed check for /api/cron/* requests.
//
// Why this exists: every cron route used to do
//   authHeader !== `Bearer ${process.env.CRON_SECRET}`
// If CRON_SECRET is ever unset (new environment, preview deploy, typo in
// the dashboard) the expected string silently becomes "Bearer undefined",
// and anyone who sends exactly that header is let in. Some of these routes
// delete schools and auth users (expire-pending-schools), so the gate must
// fail closed.
//
// Pure JS on purpose: it runs in the Edge middleware, where Node's
// crypto.timingSafeEqual is not available.

export function isCronAuthorized(
  authHeader: string | null | undefined,
  secret: string | undefined,
): boolean {
  // Fail closed: no secret configured means nobody is authorized.
  if (!secret || secret === 'undefined' || secret === 'null') return false
  if (!authHeader) return false

  const expected = `Bearer ${secret}`
  if (authHeader.length !== expected.length) return false

  // Constant-time comparison (no early exit on the first differing char).
  let diff = 0
  for (let i = 0; i < expected.length; i++) {
    diff |= authHeader.charCodeAt(i) ^ expected.charCodeAt(i)
  }
  return diff === 0
}
