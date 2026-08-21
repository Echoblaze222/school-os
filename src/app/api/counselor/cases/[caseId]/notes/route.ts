// src/app/api/counselor/cases/[caseId]/notes/route.ts
// Confidential notes. Append-only by design (no PATCH/DELETE) so a case's
// history can never be silently edited after the fact.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAppointment } from '@/lib/permissions'

export async function POST(request: Request, { params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params
  const supabase = await createClient()
  const caller = await requireAppointment(supabase, 'counselor')
  if (!caller || !caller.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { note } = await request.json()
  if (!note || typeof note !== 'string' || !note.trim()) {
    return NextResponse.json({ error: 'Note text is required.' }, { status: 400 })
  }
  if (note.length > 8000) {
    return NextResponse.json({ error: 'Note is too long. Keep it under 8000 characters, or split it into two notes.' }, { status: 400 })
  }

  // Confirm the case actually belongs to this counselor before attaching a
  // note to it, not just that the id looks plausible.
  const { data: caseRow } = await supabase
    .from('counseling_cases')
    .select('id')
    .eq('id', caseId)
    .eq('counselor_profile_id', caller.userId)
    .maybeSingle()

  if (!caseRow) {
    return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
  }

  const { data: created, error } = await supabase
    .from('counseling_notes')
    .insert({
      case_id: caseId,
      school_id: caller.schoolId,
      author_profile_id: caller.userId,
      note: note.trim(),
    })
    .select('id, note, created_at')
    .single()

  if (error) {
    return NextResponse.json({ error: 'Could not save the note. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ note: created })
}
