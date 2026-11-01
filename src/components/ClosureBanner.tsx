// src/components/ClosureBanner.tsx
//
// Server component shown at the top of the student and parent areas while the
// school is in closure / remote-learning mode. It fails quiet: if the table
// doesn't exist yet, nothing is configured, or anything errors, it renders
// nothing, so it can never break a page.

import Link from 'next/link'
import { getAuthUser } from '@/lib/supabase/authUser'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { bannerTitle, isClosureLive, reasonLabel } from '@/lib/closure'

export default async function ClosureBanner({ role }: { role: 'student' | 'parent' }) {
  try {
    const user = await getAuthUser()
    if (!user) return null

    const supabase = await createClient()
    const { data: profile } = await supabase.from('profiles').select('school_id').eq('id', user.id).single()
    const schoolId = (profile as any)?.school_id as string | undefined
    if (!schoolId) return null

    const admin = createAdminClient()
    const { data, error } = await admin
      .from('school_closures')
      .select('mode, reason, message, starts_on, expected_end_on, active')
      .eq('school_id', schoolId).eq('active', true).maybeSingle()
    if (error || !data || !isClosureLive(data as any)) return null

    const c = data as { mode: string; reason: string; message: string | null; expected_end_on: string | null }
    const remote = c.mode === 'remote'
    const accent = remote ? '#2563EB' : '#D97706'
    const link = role === 'parent'
      ? { href: '/dashboard/parent/assignments', label: 'See assignments' }
      : { href: '/dashboard/student/quizzes', label: 'Open quizzes' }

    return (
      <div role="status" style={{
        padding: '12px 16px', background: `${accent}18`, borderBottom: `2px solid ${accent}`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <p style={{ margin: 0, fontWeight: 800, fontSize: '0.9rem', color: accent }}>
          {bannerTitle(c.mode)} <span style={{ fontWeight: 600, opacity: 0.8 }}>· {reasonLabel(c.reason)}</span>
        </p>
        {c.message && <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{c.message}</p>}
        {c.expected_end_on && (
          <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expected to reopen after {c.expected_end_on}.</p>
        )}
        {remote && (
          <Link href={link.href} style={{ alignSelf: 'flex-start', marginTop: 4, fontSize: '0.78rem', fontWeight: 700, color: accent }}>
            {link.label} →
          </Link>
        )}
      </div>
    )
  } catch {
    return null
  }
}
