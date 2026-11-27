// src/lib/email/notifyResultsPublished.ts
// After results are published, email the parents of the students whose
// results just went live (plus an in-app notification). One email per
// parent per term, naming every child of theirs in that batch.
//
// Idempotent: dedupeKey includes the parent, term, year and first student,
// so re-publishing or a retried request does not email the same parent
// twice for the same results. Never throws: results are already published
// by the time this runs, so an email problem must not surface as a failure.

import { createAdminClient } from '@/lib/supabase/admin'
import { queueEmail } from '@/lib/email/queueEmail'
import { resultsEmail } from '@/lib/email/templates'

type AdminClient = ReturnType<typeof createAdminClient>

export interface PublishedResultRow {
  student_id: string | null
  term: string | null
  academic_year: string | null
}

const CONCURRENCY = 5

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

function termLabel(raw: string) {
  if (/term/i.test(raw)) return raw
  return raw.charAt(0).toUpperCase() + raw.slice(1) + ' Term'
}

export async function emailParentsResultsPublished(
  admin: AdminClient,
  schoolId: string,
  rows: PublishedResultRow[],
): Promise<{ emailed: number; queued: number; deduped: number; failed: number }> {
  const totals = { emailed: 0, queued: 0, deduped: 0, failed: 0 }

  try {
    // Group student ids by term + academic year
    const groups = new Map<string, { term: string; year: string; studentIds: Set<string> }>()
    for (const r of rows) {
      if (!r.student_id || !r.term || !r.academic_year) continue
      const key = `${r.term}|${r.academic_year}`
      const g = groups.get(key) ?? { term: r.term, year: r.academic_year, studentIds: new Set<string>() }
      g.studentIds.add(r.student_id)
      groups.set(key, g)
    }
    if (groups.size === 0) return totals

    const { data: school } = await admin
      .from('schools')
      .select('name, primary_color')
      .eq('id', schoolId)
      .single()
    const schoolName = school?.name ?? 'SchoolOS'
    const resultsUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/parent/results`

    for (const g of groups.values()) {
      const studentIds = Array.from(g.studentIds)

      const { data: students } = await admin
        .from('profiles')
        .select('id, full_name, parent_id')
        .in('id', studentIds)
        .not('parent_id', 'is', null)

      const byParent = new Map<string, { id: string; name: string }[]>()
      for (const s of students ?? []) {
        const list = byParent.get((s as any).parent_id) ?? []
        list.push({ id: (s as any).id, name: (s as any).full_name ?? 'your child' })
        byParent.set((s as any).parent_id, list)
      }
      if (byParent.size === 0) continue

      const { data: parents } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', Array.from(byParent.keys()))
        .not('email', 'is', null)

      const queue = [...(parents ?? [])] as any[]
      const notifyRows: any[] = []
      const label = termLabel(g.term)

      await Promise.all(
        Array.from({ length: CONCURRENCY }, async () => {
          while (queue.length) {
            const p = queue.shift()!
            try {
              const kids = (byParent.get(p.id) ?? []).sort((a, b) => a.id.localeCompare(b.id))
              const names = kids.map(k => k.name).join(' and ')

              const { subject, html } = resultsEmail({
                schoolName,
                brandColor: school?.primary_color ?? undefined,
                parentName: p.full_name ?? 'Parent',
                studentName: names,
                term: label,
                session: g.year,
                resultsUrl,
              })

              const out = await queueEmail({
                schoolId,
                recipientId: p.id,
                to: p.email,
                subject,
                html,
                referenceTable: 'results',
                dedupeKey: `results-published-${p.id}-${slug(g.term)}-${slug(g.year)}-${kids[0]?.id}`,
              })

              if (out.status === 'sent') totals.emailed++
              else if (out.status === 'deduped') totals.deduped++
              else if (out.status === 'queued') totals.queued++
              else totals.failed++

              if (out.status !== 'deduped') {
                notifyRows.push({
                  user_id: p.id,
                  school_id: schoolId,
                  type: 'system',
                  title: 'Results published',
                  body: `${label} (${g.year}) results for ${names} are ready.`,
                  action_url: '/dashboard/parent/results',
                  is_read: false,
                })
              }
            } catch {
              totals.failed++
            }
          }
        }),
      )

      if (notifyRows.length) {
        await admin.from('notifications').insert(notifyRows)
      }
    }
  } catch (e) {
    console.error('[emailParentsResultsPublished] failed:', e)
  }

  return totals
}
