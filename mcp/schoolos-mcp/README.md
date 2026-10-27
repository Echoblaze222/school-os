# SchoolOS test MCP

Lets an AI client (Claude Code) test SchoolOS as each role in real time. Two servers, both free:

- `schoolos`: this folder. Logs in as test users and checks data, RLS and API routes.
- `playwright`: drives a real browser against `npm run dev`. Clicks through dashboards, takes screenshots.

## Safety (read this)
- Anon key only. It refuses a service-role or secret key.
- You only have one Supabase project, so it is production. The server refuses to start against it
  unless `ALLOW_PRODUCTION=yes`, and then it is always READ ONLY: no writes, GET requests only.
- Secret tables (`profile_secrets`, `platform_admins`, webhook and email logs, medical and counseling notes) are blocked.
- Use test accounts from a test school. Do not use a real principal's login.
- `.env` is git-ignored. Never paste passwords into chat or commit them.

## Setup (about 5 minutes)
```bash
cd mcp/schoolos-mcp
npm install
npm run selftest      # offline check, should print ALL PASSED
cp .env.example .env  # then fill SUPABASE_ANON_KEY and the test accounts
```

From the repo root, Claude Code reads `.mcp.json` automatically. Approve the two servers when it asks.
Run the app with `npm run dev`, then ask Claude Code for example:
- "Log in as each role and screenshot every dashboard, then list anything that looks broken"
- "Use check_rls on `payment_invoices` and tell me if any role sees another school's rows"
- "List all routes under /api/ai and call the GET ones as the teacher"

## Tools (schoolos server)
- `status`: safety mode, roles with credentials, current role
- `login_as(role)`
- `query_table(table, select, eq, limit)`: read only, as the current role
- `check_rls(table)`: row counts visible to every role (spot cross-role or cross-school leaks)
- `list_routes(filter)`: page and API routes from `src/app`
- `call_api(method, path, body)`: `/api/*` as the current role. The cookie format is best effort, verify it against your Supabase SSR version.

## Moving to real staging later
When you can afford a second project (or run `supabase start` locally with Docker, which is free):
set `SUPABASE_URL` to it, remove `ALLOW_PRODUCTION`, and set `ALLOW_WRITES=yes` if you want write tests.
