// src/app/api/principal/settings/route.ts
// Saves school settings for the authenticated principal.
// Validates ownership before writing — a principal can only update their own school.

import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

interface SettingsBody {
  name?:            string
  tagline?:         string
  address?:         string
  city?:            string
  state?:           string
  phone?:           string
  email?:           string
  school_type?:     string
  primary_color?:   string
  font_family?:     string
  logo_url?:        string | null
  build_image_url?: string | null
}

export async function POST(req: Request) {
  // ── 1. Verify session ─────────────────────────────────────────────────────
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Confirm caller is a principal ──────────────────────────────────────
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, school_id')
    .eq('id', session.user.id)
    .single()

  if (!profile || profile.role !== 'principal') {
    return NextResponse.json({ error: 'Forbidden: not a principal' }, { status: 403 })
  }

  if (!profile.school_id) {
    return NextResponse.json({ error: 'No school linked to this account' }, { status: 400 })
  }

  // ── 3. Parse body ─────────────────────────────────────────────────────────
  let body: SettingsBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // ── 4. Validate required fields ───────────────────────────────────────────
  if (body.name !== undefined && body.name.trim().length < 2) {
    return NextResponse.json(
      { error: 'School name must be at least 2 characters.' },
      { status: 400 },
    )
  }

  if (body.primary_color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(body.primary_color)) {
    return NextResponse.json(
      { error: 'primary_color must be a valid hex colour (e.g. #800020).' },
      { status: 400 },
    )
  }

  // ── 5. Build update payload (only fields provided) ────────────────────────
  const update: Record<string, unknown> = {}

  const allowed: (keyof SettingsBody)[] = [
    'name', 'tagline', 'address', 'city', 'state',
    'phone', 'email', 'school_type', 'primary_color',
    'font_family', 'logo_url', 'build_image_url',
  ]

  for (const key of allowed) {
    if (key in body) {
      // Trim strings; keep null as-is (for removals)
      const val = body[key]
      update[key] = typeof val === 'string' ? val.trim() : val
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })
  }

  update.updated_at = new Date().toISOString()

  // ── 6. Persist ────────────────────────────────────────────────────────────
  const { error: updateError } = await admin
    .from('schools')
    .update(update)
    .eq('id', profile.school_id)

  if (updateError) {
    console.error('[principal/settings] update error:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // ── 7. Optionally notify the principal (audit trail) ──────────────────────
  await admin.from('notifications').insert({
    user_id:   profile.id,
    school_id: profile.school_id,
    title:     '⚙️ Settings Updated',
    body:      'Your school settings were saved successfully.',
    type:      'system',
  }).then(() => {/* fire-and-forget */})

  return NextResponse.json({ ok: true })
}
