# Email setup: Brevo (no domain needed) or Resend

All email in SchoolOS goes through `src/lib/email/queueEmail.ts`. It sends through Brevo or Resend,
chosen by environment variables. Every attempt is logged in the `email_deliveries` table and failed
sends are retried by the `email-retry` cron job (every 5 minutes).

## Which provider is used

1. `EMAIL_PROVIDER=brevo` or `EMAIL_PROVIDER=resend` forces one.
2. Otherwise Brevo is used when `BREVO_API_KEY` is set, and Resend when it is not.

## Brevo setup (about 10 minutes)

1. Create a free account at brevo.com. The free plan sends 300 emails a day.
2. Add and verify a sender: Senders, Domains and Dedicated IPs, then Senders, then Add a sender.
   Use an inbox you can open. Brevo emails a verification link to it.
3. Create an API key: your name menu, SMTP and API, then API Keys, then Generate a new API key.
   It must be a v3 API key, not an SMTP password.
4. In Vercel (project `school-os-j4bn`, Settings, Environment Variables, Production) add:
   - `BREVO_API_KEY` : the key from step 3
   - `BREVO_SENDER_EMAIL` : the exact address you verified in step 2
   - `BREVO_SENDER_NAME` : optional, defaults to `SchoolOS`
5. Redeploy the latest production build. Vercel only applies new variables to new deployments.
6. If sends fail with a 401 mentioning an unrecognised IP, open Brevo, Security, Authorised IPs
   and deactivate the blocking. Vercel does not use fixed IP addresses.

## What recipients will see

A sender without an authenticated domain has two limits to know about:

- Gmail, Yahoo and Microsoft expect the sending domain to be authenticated. A Gmail address as sender
  cannot be signed by Brevo, so some messages will land in spam.
- Brevo may show the sender's domain as `brevosend.com`, so recipients can see an unfamiliar "via" address.

For testing and small pilots this is fine. Before real schools depend on email (fee receipts,
access codes, login help), buy a cheap domain, authenticate it in Brevo (Senders, Domains, Domains,
then add the DNS records), and change `BREVO_SENDER_EMAIL` to an address on it. No code change.

## Checking that it works

- Brevo: Transactional, Logs shows each email and its delivery status.
- Database: `select status, attempts, error, created_at from email_deliveries order by created_at desc limit 20;`
  A `failed` row with `permanent_failure = true` means a configuration problem. The `error` column says which
  (for example `Brevo 400: Sender is invalid` means the sender was not verified or the address does not match).

## Resend (needs a verified domain)

Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (for example `SchoolOS <noreply@yourdomain.com>`) and
leave `BREVO_API_KEY` unset, or set `EMAIL_PROVIDER=resend`. Without a verified domain Resend refuses to
send to anyone but the account owner.

## Limits worth knowing

- Brevo has no idempotency key. If a request times out after Brevo already accepted it, the retry can send a
  second copy. This is rare; Resend avoids it with a per-row key.
- 300 a day on the free plan. A bulk send to a whole school can exceed that in one day.
