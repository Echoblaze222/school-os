// src/app/api/principal/settings/route.ts
// FIXED:
//   1. getSession() → getUser()  (getSession is unreliable in App Router API routes)
//   2. 'build_image_url' → 'login_bg_image'  (actual column name in schools table)
//   3. Removed 'updated_at' from update payload (column doesn't exist on schools)
//   4. Notification insert wrapped in try/catch so a missing table can't kill the save
//   5. school_type values matched to enum: 'primary' | 'secondary' | 'combined'

import { NextResponse }       from 'next/server'
import { createClient }       from '@/lib/supabase/server'
import { createAdminClient }  from '@/lib/supabase/admin'

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
  login_bg_image?:  string | null   // ← correct column name
}

export async function POST(req: Request) {
  // ── 1. Verify session (use getUser — never getSession in API routes) ───────
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // ── 2. Confirm caller is a principal ──────────────────────────────────────
  const admin = createAdminClient()

  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, school_id')
    .eq('id', user.id)
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

  // ── 4. Validate ───────────────────────────────────────────────────────────
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

  // ── 5. Build update payload — only real columns ───────────────────────────
  const update: Record<string, unknown> = {}

  const allowed: (keyof SettingsBody)[] = [
    'name', 'tagline', 'address', 'city', 'state',
    'phone', 'email', 'school_type', 'primary_color',
    'font_family', 'logo_url', 'login_bg_image',   // ← login_bg_image not build_image_url
  ]

  for (const key of allowed) {
    if (key in body) {
      const val = body[key]
      update[key] = typeof val === 'string' ? val.trim() : val
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update.' }, { status: 400 })
  }

  // NOTE: no update.updated_at — schools table has no such column

  // ── 6. Persist ────────────────────────────────────────────────────────────
  const { error: updateError } = await admin
    .from('schools')
    .update(update)
    .eq('id', profile.school_id)

  if (updateError) {
    console.error('[principal/settings] update error:', updateError)
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // ── 7. Audit notification — fire-and-forget, never crash the response ─────
  try {
    await admin.from('notifications').insert({
      user_id:   profile.id,
      school_id: profile.school_id,
      title:     '⚙️ Settings Updated',
      body:      'Your school settings were saved successfully.',
      type:      'system',
    })
  } catch {
    // Not critical — ignore if notifications table doesn't exist yet
  }

  return NextResponse.json({ ok: true })
}
