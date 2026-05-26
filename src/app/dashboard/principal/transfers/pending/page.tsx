// src/app/dashboard/principal/transfers/pending/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import PendingTransfersClient from './PendingTransfersClient'

export interface PendingTransferRow {
  id: string; student_id: string; student_name: string; student_number: string | null
  origin_school_name: string | null; initiated_at: string; notes: string | null
  avg_score: number | null; total_results: number; outstanding_fees: number
}

export default async function PendingTransfersPage() {
  const supabase = createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('role,school_id').eq('id', user.id).single()
  if (!profile || !['principal','admin'].includes((profile as any).role)) redirect('/dashboard/student')
  const schoolId = (profile as any).school_id

  const { data: transfers } = await supabase
    .from('student_transfers')
    .select(`id,student_id,initiated_at,notes,
      student_profiles(full_name,student_number,schools(name),fee_invoices(amount_due,amount_paid))
    `)
    .eq('destination_school_id', schoolId)
    .eq('status','requested')
    .order('initiated_at', { ascending: false })

  const rows: PendingTransferRow[] = []
  for (const t of transfers ?? []) {
    const t_ = t as any
    const sp = t_.student_profiles
    const outstanding = (sp?.fee_invoices ?? []).reduce((s: number, f: any) => s + Math.max((f.amount_due??0)-(f.amount_paid??0),0), 0)
    const { data: results } = await supabase.from('results').select('score,max_score').eq('student_id', t_.student_id)
    const rr = results ?? []
    const avg = rr.length > 0 ? Math.round(rr.reduce((s: number, r: any) => s + (r.max_score>0?(r.score/r.max_score)*100:0), 0) / rr.length) : null
    rows.push({
      id: t_.id, student_id: t_.student_id,
      student_name: sp?.full_name ?? 'Unknown', student_number: sp?.student_number ?? null,
      origin_school_name: sp?.schools?.name ?? null, initiated_at: t_.initiated_at, notes: t_.notes ?? null,
      avg_score: avg, total_results: rr.length, outstanding_fees: outstanding,
    })
  }

  return <PendingTransfersClient transfers={rows} principalId={user.id} />
}
