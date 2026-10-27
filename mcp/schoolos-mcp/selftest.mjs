// Offline self test: starts the server over stdio and checks tools and safety guards.
// Run: npm run selftest
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const fakeJwt = (role) =>
  'x.' + Buffer.from(JSON.stringify({ role })).toString('base64url') + '.y'

function runGuard(env) {
  return new Promise((resolve) => {
    const p = spawn('node', [path.join(dir, 'index.mjs')], { env: { PATH: process.env.PATH, ...env } })
    let err = ''
    p.stderr.on('data', (d) => (err += d))
    p.on('exit', (code) => resolve({ code, err: err.trim() }))
    setTimeout(() => { p.kill(); resolve({ code: 'still-running', err }) }, 2500)
  })
}

async function rpcSession(env, calls) {
  const p = spawn('node', [path.join(dir, 'index.mjs')], { env: { PATH: process.env.PATH, ...env } })
  let buf = ''
  const pending = new Map()
  p.stdout.on('data', (d) => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1)
      try { const m = JSON.parse(line); if (m.id && pending.has(m.id)) pending.get(m.id)(m) } catch {}
    }
  })
  let id = 0
  const send = (method, params) => new Promise((res) => {
    const myId = ++id; pending.set(myId, res)
    p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: myId, method, params }) + '\n')
  })
  await send('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'selftest', version: '0' } })
  p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  const out = []
  for (const c of calls) out.push(await send(c.method, c.params))
  p.kill()
  return out
}

let failed = 0
const check = (name, ok, extra = '') => { console.log((ok ? 'PASS ' : 'FAIL ') + name + (extra ? '  ' + extra : '')); if (!ok) failed++ }

const base = { SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_ANON_KEY: fakeJwt('anon'), REPO_ROOT: dir }

let r = await runGuard({})
check('exits without env', r.code === 1 && /required/.test(r.err))
r = await runGuard({ ...base, SUPABASE_ANON_KEY: fakeJwt('service_role') })
check('refuses service_role key', r.code === 1 && /service-role/.test(r.err))
r = await runGuard({ ...base, SUPABASE_ANON_KEY: 'sb_secret_abc' })
check('refuses sb_secret key', r.code === 1 && /secret key/.test(r.err))
r = await runGuard({ ...base, PRODUCTION_SUPABASE_URL: 'https://abc.supabase.co' })
check('refuses production without opt-in', r.code === 1 && /production/.test(r.err))

const prodEnv = { ...base, PRODUCTION_SUPABASE_URL: 'https://abc.supabase.co', ALLOW_PRODUCTION: 'yes', ALLOW_WRITES: 'yes' }
const res = await rpcSession(prodEnv, [
  { method: 'tools/list', params: {} },
  { method: 'tools/call', params: { name: 'status', arguments: {} } },
  { method: 'tools/call', params: { name: 'query_table', arguments: { table: 'profile_secrets' } } },
  { method: 'tools/call', params: { name: 'call_api', arguments: { method: 'POST', path: '/api/demo' } } },
  { method: 'tools/call', params: { name: 'login_as', arguments: { role: 'principal' } } },
  { method: 'tools/call', params: { name: 'query_table', arguments: { table: 'classes', select: '*;drop' } } },
])
const names = res[0].result.tools.map((t) => t.name).sort()
check('lists 6 tools', names.join(',') === 'call_api,check_rls,list_routes,login_as,query_table,status', names.join(','))
const status = JSON.parse(res[1].result.content[0].text)
check('prod forces read-only even with ALLOW_WRITES=yes', status.mode === 'read-only' && status.production === true)
check('blocks profile_secrets', res[2].result.isError === true && /blocked/.test(res[2].result.content[0].text))
check('POST rejected in read-only', res[3].result.isError === true && /Read-only/.test(res[3].result.content[0].text))
check('login without creds fails cleanly', res[4].result.isError === true && /No test credentials/.test(res[4].result.content[0].text))
check('bad select string rejected by schema', !!res[5].error || res[5].result?.isError === true)

console.log(failed ? '\n' + failed + ' FAILED' : '\nALL PASSED')
process.exit(failed ? 1 : 0)
