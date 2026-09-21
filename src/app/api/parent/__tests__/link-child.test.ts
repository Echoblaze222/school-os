import { describe, it, expect, vi, beforeEach } from 'vitest'
import { generateLinkCode, hashLinkCode, generateActivationToken } from '@/lib/credentials'

// Same approach as the first-login test: an in-memory stand-in that follows the
// contract of the SQL functions resolve_student_link_code / link_parent_by_code.
const h = vi.hoisted(() => {
  type Profile = { id: string; role: string; school_id: string | null; full_name: string; default_code?: string }
  type Code = { hash: string; studentId: string; schoolId: string; expiresAt: number; revokedAt: number | null }
  const state = {
    user: null as { id: string } | null,
    profiles: new Map<string, Profile>(),
    codes: [] as Code[],
    links: [] as Array<{ parent: string; student: string }>,
    rateAllowed: true,
    makeAdmin: null as unknown as () => any,
  }
  const live = (c: Code) => c.revokedAt === null && c.expiresAt > Date.now()
  state.makeAdmin = () => ({
    rpc: async (fn: string, args: any) => {
      if (fn === 'resolve_student_link_code') {
        const c = state.codes.find(x => x.hash === args.p_code_hash && live(x) && x.schoolId === args.p_school_id)
        const s = c && state.profiles.get(c.studentId)
        return { data: c && s && s.role === 'student' && s.school_id === args.p_school_id ? c.studentId : null, error: null }
      }
      if (fn === 'link_parent_by_code') {
        const p = state.profiles.get(args.p_parent_id)
        if (!p || p.role !== 'parent' || !p.school_id) return { data: null, error: null }
        const c = state.codes.find(x => x.hash === args.p_code_hash && live(x) && x.schoolId === p.school_id)
        const s = c && state.profiles.get(c.studentId)
        if (!c || !s || s.role !== 'student' || s.school_id !== p.school_id) return { data: null, error: null }
        if (!state.links.some(l => l.parent === p.id && l.student === s.id)) state.links.push({ parent: p.id, student: s.id })
        return { data: s.id, error: null }
      }
      throw new Error('unexpected rpc ' + fn)
    },
    from: (table: string) => {
      let id = ''
      const chain: any = {
        select: () => chain,
        eq: (_c: string, v: string) => { id = v; return chain },
        single: async () => ({ data: state.profiles.get(id) ?? null, error: null }),
        maybeSingle: async () => {
          if (table === 'student_profiles') return { data: { classes: { name: 'JSS1', class_level: 'JSS 1' } }, error: null }
          const p = state.profiles.get(id)
          return { data: p ? { full_name: p.full_name, avatar_url: null } : null, error: null }
        },
      }
      return chain
    },
  })
  return state
})

vi.mock('@/lib/rateLimit', () => ({
  getClientIp: () => '203.0.113.9',
  checkRateLimit: async () =>
    h.rateAllowed ? { allowed: true } : { allowed: false, errorResponse: { error: 'Too many attempts.', status: 429, retryAfter: 60 } },
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }),
}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => h.makeAdmin() }))

import { POST } from '../link-child/route'

const KINGS = 'school-1'
const OTHER = 'school-2'

function call(body: Record<string, unknown>) {
  return POST(new Request('http://localhost/api/parent/link-child', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  }))
}

function seedStudentCode(opts: { school?: string; ttlMs?: number; revoked?: boolean } = {}) {
  const code = generateLinkCode()
  h.profiles.set('student-1', { id: 'student-1', role: 'student', school_id: opts.school ?? KINGS, full_name: 'Ada Obi', default_code: 'STU-2026-0001' })
  h.codes.push({ hash: hashLinkCode(code)!, studentId: 'student-1', schoolId: opts.school ?? KINGS, expiresAt: Date.now() + (opts.ttlMs ?? 3_600_000), revokedAt: opts.revoked ? Date.now() : null })
  return code
}

function signInAs(id: string, role: string, school: string | null = KINGS) {
  h.profiles.set(id, { id, role, school_id: school, full_name: id })
  h.user = { id }
}

beforeEach(() => {
  h.user = null
  h.profiles.clear()
  h.codes.length = 0
  h.links.length = 0
  h.rateAllowed = true
})

describe('POST /api/parent/link-child', () => {
  it('requires a signed-in user', async () => {
    const code = seedStudentCode()
    expect((await call({ child_code: code })).status).toBe(401)
    expect(h.links).toHaveLength(0)
  })

  it.each(['student', 'teacher', 'principal', 'bursar'])('a %s cannot link a child', async role => {
    const code = seedStudentCode()
    signInAs('caller', role)
    expect((await call({ child_code: code })).status).toBe(403)
    expect(h.links).toHaveLength(0)
  })

  it('parent + valid code in the same school: preview then link succeed', async () => {
    const code = seedStudentCode()
    signInAs('parent-1', 'parent')
    const preview = await call({ child_code: code, preview: true })
    const pj = await preview.json()
    expect(preview.status).toBe(200)
    expect(pj.student).toEqual({ full_name: 'Ada Obi', avatar_url: null, class_label: 'JSS 1' })
    expect(JSON.stringify(pj)).not.toContain('student-1') // preview does not disclose the student id
    expect(h.links).toHaveLength(0)

    const link = await call({ child_code: code })
    expect(link.status).toBe(200)
    expect((await link.json()).child).toEqual({ id: 'student-1', full_name: 'Ada Obi' })
    expect(h.links).toEqual([{ parent: 'parent-1', student: 'student-1' }])
  })

  it('the student\'s normal default_code is NOT a link credential', async () => {
    seedStudentCode()
    signInAs('parent-1', 'parent')
    for (const notACode of ['STU-2026-0001', 'ABC-2026-0001', 'PRIN-528-F0A', generateActivationToken()]) {
      expect((await call({ child_code: notACode })).status).toBe(404)
      expect((await call({ child_code: notACode, preview: true })).status).toBe(404)
    }
    expect(h.links).toHaveLength(0)
  })

  it('a parent in another school cannot use a code from this school', async () => {
    const code = seedStudentCode({ school: KINGS })
    signInAs('parent-x', 'parent', OTHER)
    expect((await call({ child_code: code })).status).toBe(404)
    expect((await call({ child_code: code, preview: true })).status).toBe(404)
    expect(h.links).toHaveLength(0)
  })

  it('expired and revoked (rotated) codes are rejected', async () => {
    signInAs('parent-1', 'parent')
    const expired = seedStudentCode({ ttlMs: -1000 })
    expect((await call({ child_code: expired })).status).toBe(404)
    h.codes.length = 0
    const revoked = seedStudentCode({ revoked: true })
    expect((await call({ child_code: revoked })).status).toBe(404)
    expect(h.links).toHaveLength(0)
  })

  it('all failures look identical (no hint whether a code, student or school exists)', async () => {
    seedStudentCode()
    signInAs('parent-1', 'parent')
    const a = await (await call({ child_code: generateLinkCode() })).json()
    const b = await (await call({ child_code: 'STU-2026-0001' })).json()
    expect(a).toEqual(b)
  })

  it('is rate limited', async () => {
    const code = seedStudentCode()
    signInAs('parent-1', 'parent')
    h.rateAllowed = false
    expect((await call({ child_code: code })).status).toBe(429)
    expect(h.links).toHaveLength(0)
  })

  it('requires a code', async () => {
    signInAs('parent-1', 'parent')
    expect((await call({})).status).toBe(400)
  })
})
