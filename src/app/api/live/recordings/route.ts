// src/app/api/live/recordings/route.ts
//
// Lists recordings the caller is allowed to browse. This is a LIST
// endpoint only — it returns metadata (title, class, date, duration),
// never a playback URL. Getting an actual signed URL still goes through
// /api/live/recording/[id]/url, which independently re-checks the
// recording's school_id against the caller's — so even if this route's
// scoping had a bug, playback itself has its own, separate check.
//
// Scoping is resolved here (DB lookups), the ROLE decision itself is
// recordingsScopeFor() in authorize.ts (unit-tested there without a DB).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { recordingsScopeFor } from '@/lib/liveClass/authorize'

export async function GET() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('role, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return NextResponse.json({ error: "We couldn't find your profile." }, { status: 403 })

  const scope = recordingsScopeFor(profile.role)
  if (scope === 'none') {
    // Not an error — just an empty, valid result. A parent (or any other
    // role recordingsScopeFor doesn't recognize) asking for this list
    // isn't doing anything wrong; there's simply nothing to show them
    // yet. See recordingsScopeFor's doc comment for why 'parent' lands
    // here rather than a guessed-at scope.
    return NextResponse.json({ recordings: [] })
  }

  let classIds: string[] | null = null // null = no class-level filter (all_school)

  if (scope === 'teacher_classes') {
    const { data: rows } = await supabase.from('class_teachers').select('class_id').eq('teacher_id', user.id)
    classIds = (rows ?? []).map(r => r.class_id)
    if (classIds.length === 0) return NextResponse.json({ recordings: [] })
  }

  if (scope === 'single_class') {
    const { data: studentProfile } = await supabase.from('student_profiles').select('class_id').eq('id', user.id).maybeSingle()
    if (!studentProfile?.class_id) return NextResponse.json({ recordings: [] })
    classIds = [studentProfile.class_id]
  }

  // RLS (Phase 0) already scopes this SELECT to the caller's own school
  // regardless of what's queried below — this app-layer class_id filter
  // is what narrows further, from "same school" to "your classes"
  // (teacher) or "your class" (student), which RLS does not do on its
  // own (see the Phase 0 migration's explicit note on that boundary).
  //
  // `online_classes!inner(...)` — the `!inner` hint is required for
  // PostgREST to apply .in('online_classes.class_id', ...) as an actual
  // filter on the query rather than a left join that just leaves the
  // embedded object null on non-matches while still returning the outer
  // row. Without it, the filter below would look like it's narrowing the
  // result set but silently wouldn't be.
  let query = supabase
    .from('class_recordings')
    .select('id, duration_seconds, size_bytes, status, created_at, online_class_id, online_classes!inner(title, class_id, classes(name))')
    .eq('status', 'ready')
    .order('created_at', { ascending: false })
    .limit(100)

  if (classIds) {
    query = query.in('online_classes.class_id', classIds)
  }

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Defensive re-filter regardless of whether the `!inner` hint above
  // behaves exactly as documented against this project's actual
  // Supabase/PostgREST version — unverified in this environment (no live
  // project to test against). This is what actually guarantees no
  // cross-class row can leak even if the query-level filter above turns
  // out not to narrow correctly; it does not depend on `!inner` working.
  const filtered = classIds
    ? (data ?? []).filter((r: any) => classIds!.includes(r.online_classes?.class_id))
    : (data ?? [])

  const recordings = filtered.map((r: any) => ({
    id: r.id,
    title: r.online_classes?.title ?? 'Untitled session',
    className: r.online_classes?.classes?.name ?? null,
    durationSeconds: r.duration_seconds,
    sizeBytes: r.size_bytes,
    recordedAt: r.created_at,
  }))

  return NextResponse.json({ recordings })
}
