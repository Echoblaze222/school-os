import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => {
  type Profile = { id: string; role: string; school_id: string | null }
  const state = {
    user: null as { id: string } | null,
    profiles: new Map<string, Profile>(),
    rpcCalls: [] as Array<{ fn: string; args: any }>,
    audit: [] as any[],
    makeAdmin: null as unknown as () => any,
  }
  state.makeAdmin = () => ({
    rpc: async (fn: string, args: any) => {
      state.rpcCalls.push({ fn, args })
      return { data: '2030-01-01T00:00:00.000Z', error: null }
    },
    from: (table: string) => {
      let id = ''
      const chain: any = {
        select: () => chain,
        eq: (_c: string, v: string) => { id = v; return chain },
        single: async () => ({ data: state.profiles.get(id) ?? null, error: null }),
        maybeSingle: async () => ({ data: state.profiles.get(id) ?? null, error: null }),
        insert: async (row: any) => { if (table === 'portal_audit_log') state.audit.push(row); return { error: null } },
      }
      return chain
    },
  })
  return state
})

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.makeAdmin() }))

import { POST } from '../link-code/route'

function call(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/students/link-code', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
}

function signInAs(id: string, role: string, school: string | null = 'school-1') {
  h.profiles.set(id, { id, role, school_id: school })
  h.user = { id }
}

beforeEach(() => {
  h.user = null
  h.profiles.clear()
  h.rpcCalls.length = 0
  h.audit.length = 0
  h.profiles.set('student-1', { id: 'student-1', role: 'student', school_id: 'school-1' })
  h.profiles.set('student-other', { id: 'student-other', role: 'student', school_id: 'school-2' })
  h.profiles.set('teacher-1', { id: 'teacher-1', role: 'teacher', school_id: 'school-1' })
})

describe('POST /api/students/link-code', () => {
  it('requires sign-in', async () => {
    expect((await call({ studentId: 'student-1' })).status).toBe(401)
    expect(h.rpcCalls).toHaveLength(0)
  })

  it.each(['student', 'teacher', 'parent', 'bursar'])('a %s cannot issue link codes', async role => {
    signInAs('caller', role)
    expect((await call({ studentId: 'student-1' })).status).toBe(403)
    expect(h.rpcCalls).toHaveLength(0)
  })

  it.each(['principal', 'secretary', 'admin'])('a %s can issue a code for a student in their own school', async role => {
    signInAs('caller', role)
    const res = await call({ studentId: 'student-1' })
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.code).toMatch(/^LNK-/)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(h.rpcCalls[0].fn).toBe('issue_student_link_code')
    // only the hash is sent onward
    expect(JSON.stringify(h.rpcCalls)).not.toContain(json.code)
    expect(h.rpcCalls[0].args.p_code_hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('cannot issue a code for a student in another school, or for a non-student', async () => {
    signInAs('caller', 'principal')
    expect((await call({ studentId: 'student-other' })).status).toBe(404)
    expect((await call({ studentId: 'teacher-1' })).status).toBe(404)
    expect((await call({ studentId: 'does-not-exist' })).status).toBe(404)
    expect(h.rpcCalls).toHaveLength(0)
  })

  it('records an audit event without the code', async () => {
    signInAs('caller', 'secretary')
    const json = await (await call({ studentId: 'student-1' })).json()
    expect(h.audit).toHaveLength(1)
    expect(h.audit[0].action).toBe('student_link_code_issued')
    expect(JSON.stringify(h.audit)).not.toContain(json.code)
  })
})
