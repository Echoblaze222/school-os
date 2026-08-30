// src/app/api/examination/certificates/settings/route.ts
// -------------------------------------------------------
// §24-27. `logo_url`/`primary_color`/`tagline` deliberately come from
// `schools` at issuance time (already the source of truth used
// everywhere else in the app, e.g. report cards) — this table only
// holds what's certificate-specific: principal name/title, signature,
// stamp, numbering prefix, verification URL. File uploads (signature,
// stamp) happen client-side to the existing `school-assets` bucket,
// same pattern as /api/principal/settings; this route just stores the
// resulting URL after validating it.
// -------------------------------------------------------

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeOptionalUrl } from '@/lib/validation/safeUrl'

export async function GET() {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return NextResponse.json({ ok: false, error: 'No school linked to this account.' }, { status: 400 })
  if (profile.role !== 'principal') return NextResponse.json({ ok: false, error: 'Forbidden.' }, { status: 403 })

  const { data: settings } = await admin.from('certificate_settings').select('*').eq('school_id', profile.school_id).maybeSingle()
  return NextResponse.json({ ok: true, settings: settings ?? null })
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const admin = createAdminClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Not authenticated.' }, { status: 401 })

  const { data: profile } = await admin.from('profiles').select('role, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return NextResponse.json({ ok: false, error: 'No school linked to this account.' }, { status: 400 })
  if (profile.role !== 'principal') return NextResponse.json({ ok: false, error: 'Only the principal can update certificate settings.' }, { status: 403 })

  let body: Record<string, any>
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, error: "Couldn't read the request body." }, { status: 400 }) }

  const prefix = (body.certificate_prefix ?? '').toString().trim().toUpperCase()
  if (prefix && !/^[A-Z0-9]{2,12}$/.test(prefix)) {
    return NextResponse.json({ ok: false, error: 'Certificate prefix must be 2-12 letters/numbers, no spaces or symbols.' }, { status: 400 })
  }

  const payload = {
    school_id: profile.school_id,
    principal_name: body.principal_name ?? null,
    principal_title: body.principal_title || 'Principal',
    signature_url: sanitizeOptionalUrl(body.signature_url),
    stamp_url: sanitizeOptionalUrl(body.stamp_url),
    certificate_prefix: prefix || 'CERT',
    verification_base_url: sanitizeOptionalUrl(body.verification_base_url),
    updated_by: user.id,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await admin.from('certificate_settings').upsert(payload, { onConflict: 'school_id' }).select().single()
  if (error) return NextResponse.json({ ok: false, error: `Could not save settings: ${error.message}` }, { status: 500 })

  return NextResponse.json({ ok: true, settings: data })
}
