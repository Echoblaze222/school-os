# SchoolOS test MCP

Lets an AI client test SchoolOS as each role, in real time.

## Rules
- Staging Supabase project only. The server exits if it sees your production URL or a service-role key.
- It uses the anon key plus seeded test users, so RLS is exercised for real.
- Do not commit `.env`. Test passwords belong in your local env only.

## Setup
```bash
cd mcp/schoolos-mcp
npm install
cp .env.example .env   # fill in staging values and test accounts
```

## Add to Claude Code
```bash
claude mcp add schoolos -- node mcp/schoolos-mcp/index.mjs
```
Pass env vars with `-e KEY=value` flags, or export them in your shell first.

## Add Playwright MCP for the UI layer
```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```
Then ask the AI to run `npm run dev`, log in as each role in the browser, and screenshot every dashboard.

## Tools
- `login_as(role)`, `whoami`
- `query_table(table, select, eq, limit)` read only, as the current role
- `check_rls(table)` row counts visible to every role (spot leaks fast)
- `list_routes(filter)` page and API routes from `src/app`
- `call_api(method, path, body)` hits `/api/*` as the current role (cookie format is best effort, verify against your Supabase SSR version)
