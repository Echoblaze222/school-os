// src/app/api/schools/promotions/[id]/analytics/route.ts
// Lane E, §60 - aggregate-only analytics for one of the school's own
// promotions. Delegates the authorization check AND the aggregation to
// public.get_promotion_analytics(), so raw event rows never pass through
// this route at all.

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: rows, error } = await supabase.rpc('get_promotion_analytics', {
    p_promotion_id: id,
  })

  if (error) {
    // The RPC raises on unauthorized access, which surfaces here as an
    // error - treat that as 403 rather than a generic 500 so the caller
    // can tell "not yours" apart from "something broke."
    if (error.message?.includes('not authorized')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('[promotions/analytics] rpc failed:', error.message)
    return NextResponse.json({ error: 'Couldn\'t load analytics.' }, { status: 500 })
  }

  const totals: Record<string, number> = {}
  for (const row of rows ?? []) {
    totals[row.event_type] = (totals[row.event_type] ?? 0) + Number(row.event_count)
  }

  return NextResponse.json({ daily: rows ?? [], totals })
}
