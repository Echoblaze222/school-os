#!/usr/bin/env node
// SchoolOS test MCP server.
// Signs in as seeded test users with the ANON key only, so every query runs under real RLS.
// Safety defaults:
//   - refuses a service-role key
//   - refuses the production project unless ALLOW_PRODUCTION=yes
//   - on production it is ALWAYS read-only (GET only, no writes)
//   - blocks tables that hold secrets
import fs from 'node:fs'
import path from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { fileURLToPath } from 'node:url'

// Load mcp/schoolos-mcp/.env if present (real env vars win)
try {
  const here = path.dirname(fileURLToPath(import.meta.url))
  for (const line of fs.readFileSync(path.join(here, '.env'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
  }
} catch {
  // no .env file, rely on the shell environment
}

const {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  PRODUCTION_SUPABASE_URL,
  ALLOW_PRODUCTION,
  ALLOW_WRITES,
  APP_BASE_URL = 'http://localhost:3000',
  REPO_ROOT = process.cwd(),
} = process.env

function die(msg) {
  console.error('[schoolos-mcp] ' + msg)
  process.exit(1)
}

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) die('SUPABASE_URL and SUPABASE_ANON_KEY are required')

const IS_PROD = Boolean(PRODUCTION_SUPABASE_URL) && SUPABASE_URL.startsWith(PRODUCTION_SUPABASE_URL)
if (IS_PROD && ALLOW_PRODUCTION !== 'yes') {
  die('SUPABASE_URL is the production project. Set ALLOW_PRODUCTION=yes to run read-only against it.')
}
const READ_ONLY = IS_PROD || ALLOW_WRITES !== 'yes'

try {
  const payload = JSON.parse(Buffer.from(SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString())
  if (payload.role === 'service_role') die('Refusing to run with a service-role key. Use the anon key.')
} catch {
  // non-JWT key formats (sb_publishable_...) are fine
}
if (SUPABASE_ANON_KEY.startsWith('sb_secret_')) die('Refusing to run with a secret key. Use the publishable or anon key.')

const ROLES = [
  'principal', 'vice_principal', 'teacher', 'bursar', 'secretary', 'student', 'parent',
  'ict', 'nurse', 'coach', 'hostel', 'counselor', 'librarian', 'examination',
]

const BLOCKED_TABLES = new Set([
  'profile_secrets', 'platform_admins', 'paystack_webhook_events', 'email_deliveries',
  'access_code_applications', 'access_codes', 'nin_verification_log', 'push_subscriptions',
  'idempotency_keys', 'job_queue', 'rate_limit_attempts', 'student_medical_records',
  'student_health_profiles', 'counseling_notes',
])

const sessions = new Map() // role -> { client, session }
let current = null

function creds(role) {
  const k = role.toUpperCase()
  const email = process.env['TEST_' + k + '_EMAIL']
  const password = process.env['TEST_' + k + '_PASSWORD']
  return email && password ? { email, password } : null
}

async function signIn(role) {
  if (sessions.has(role)) return sessions.get(role)
  const c = creds(role)
  if (!c) throw new Error('No test credentials set for role: ' + role)
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await client.auth.signInWithPassword(c)
  if (error) throw new Error('Login failed for ' + role + ': ' + error.message)
  const entry = { client, session: data.session }
  sessions.set(role, entry)
  return entry
}

function text(value) {
  const body = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  return { content: [{ type: 'text', text: body }] }
}

function fail(err) {
  return { isError: true, content: [{ type: 'text', text: String(err?.message || err) }] }
}

const server = new McpServer({ name: 'schoolos-mcp', version: '0.2.0' })

server.tool(
  'status',
  'Show safety mode, which roles have test credentials, and the current role.',
  {},
  async () =>
    text({
      mode: READ_ONLY ? 'read-only' : 'writes-allowed',
      production: IS_PROD,
      app_base_url: APP_BASE_URL,
      current_role: current,
      roles_with_credentials: ROLES.filter((r) => creds(r)),
    })
)

server.tool(
  'login_as',
  'Sign in as the test user for a role. Later tools run as this user.',
  { role: z.enum(ROLES) },
  async ({ role }) => {
    try {
      const { session } = await signIn(role)
      current = role
      return text({ role, user_id: session.user.id, email: session.user.email })
    } catch (e) {
      return fail(e)
    }
  }
)

server.tool(
  'query_table',
  'Read rows from a table as the current role (RLS applies). Read only. Secret tables are blocked.',
  {
    table: z.string().regex(/^[a-z_][a-z0-9_]*$/),
    select: z.string().regex(/^[a-zA-Z0-9_,*:()!. ]+$/).default('*'),
    eq: z.record(z.string()).optional(),
    limit: z.number().int().min(1).max(50).default(20),
  },
  async ({ table, select, eq, limit }) => {
    try {
      if (BLOCKED_TABLES.has(table)) throw new Error('Table is blocked in this MCP: ' + table)
      if (!current) throw new Error('Call login_as first')
      let q = sessions.get(current).client.from(table).select(select).limit(limit)
      for (const [k, v] of Object.entries(eq || {})) q = q.eq(k, v)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return text({ role: current, count: data.length, rows: data })
    } catch (e) {
      return fail(e)
    }
  }
)

server.tool(
  'check_rls',
  'Count rows of a table visible to every role that has test credentials. Use it to spot cross-role leaks.',
  { table: z.string().regex(/^[a-z_][a-z0-9_]*$/) },
  async ({ table }) => {
    if (BLOCKED_TABLES.has(table)) return fail('Table is blocked in this MCP: ' + table)
    const out = {}
    for (const role of ROLES) {
      if (!creds(role)) continue
      try {
        const { client } = await signIn(role)
        const { count, error } = await client.from(table).select('*', { count: 'exact', head: true })
        out[role] = error ? 'error: ' + error.message : count
      } catch (e) {
        out[role] = 'error: ' + e.message
      }
    }
    return text({ table, visible_rows_by_role: out })
  }
)

server.tool(
  'list_routes',
  'List page and API routes found under src/app in the local repo.',
  { filter: z.string().optional() },
  async ({ filter }) => {
    const root = path.resolve(REPO_ROOT, 'src/app')
    const found = []
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) walk(full)
        else if (/^(page\.tsx|route\.ts)$/.test(entry.name)) {
          const rel = '/' + path.relative(root, dir).split(path.sep).join('/')
          found.push((entry.name === 'route.ts' ? 'API ' : 'PAGE ') + rel)
        }
      }
    }
    try {
      walk(root)
    } catch (e) {
      return fail(e)
    }
    const list = filter ? found.filter((r) => r.includes(filter)) : found
    return text({ total: list.length, routes: list })
  }
)

server.tool(
  'call_api',
  'Call an /api route as the current role. GET only unless ALLOW_WRITES=yes on a non-production project.',
  {
    method: z.enum(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']).default('GET'),
    path: z.string().regex(/^\/api\/[A-Za-z0-9_\-\/\[\]?=&.%]*$/),
    body: z.record(z.any()).optional(),
  },
  async ({ method, path: p, body }) => {
    try {
      if (READ_ONLY && method !== 'GET') {
        throw new Error('Read-only mode: only GET is allowed. ' + (IS_PROD ? 'Production is always read-only.' : 'Set ALLOW_WRITES=yes to change this.'))
      }
      if (!current) throw new Error('Call login_as first')
      const { session } = sessions.get(current)
      const ref = new URL(SUPABASE_URL).hostname.split('.')[0]
      const cookieValue = 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url')
      const res = await fetch(APP_BASE_URL + p, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
          Cookie: 'sb-' + ref + '-auth-token=' + cookieValue,
        },
        body: body && method !== 'GET' ? JSON.stringify(body) : undefined,
      })
      const raw = await res.text()
      return text({ role: current, status: res.status, body: raw.slice(0, 4000) })
    } catch (e) {
      return fail(e)
    }
  }
)

await server.connect(new StdioServerTransport())
