// src/app/api/principal/settings/route.ts
// Saves school settings for the authenticated principal.
// Validates ownership before writing - a principal can only update their own school.

import { NextResponse }    from 'next/server'
import { createClient }    from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sanitizeOptionalUrl } from '@/lib/validation/safeUrl'

const ADMISSION_STATUSES = ['open', 'closed', 'waitlist']

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
  secondary_color?: string
  font_family?:     string
  logo_url?:        string | null
  build_image_url?: string | null
  is_publicly_listed?:   boolean
  description?:          string | null
  website_url?:          string | null
  public_email?:         string | null
  public_phone?:         string | null
  admission_status?:     string
  application_deadline?: string | null
  founded_year?:          number | null
  facilities?:            string[]
  programs?:              string[]
}

export async function POST(req: Request) {
  // ── 1. Verify session ─────────────────────────────────────────────────────
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

  if (body.secondary_color !== undefined && !/^#[0-9A-Fa-f]{6}$/.test(body.secondary_color)) {
    return NextResponse.json(
      { error: 'secondary_color must be a valid hex colour (e.g. #C99A3B).' },
      { status: 400 },
    )
  }

  if (body.admission_status !== undefined && !ADMISSION_STATUSES.includes(body.admission_status)) {
    return NextResponse.json(
      { error: 'admission_status must be one of open, closed, waitlist.' },
      { status: 400 },
    )
  }

  if (body.founded_year !== undefined && body.founded_year !== null) {
    const currentYear = new Date().getFullYear()
    if (!Number.isInteger(body.founded_year) || body.founded_year < 1800 || body.founded_year > currentYear) {
      return NextResponse.json(
        { error: `founded_year must be a year between 1800 and ${currentYear}.` },
        { status: 400 },
      )
    }
  }

  // ── 5. Build update payload (only fields provided) ────────────────────────
  // secondary_color now lives directly on the `schools` table (see the
  // schools-branding-columns migration referenced in dashboard/principal/layout.tsx),
  // which is also what SchoolBrandInjector reads via each role's layout - so it's
  // written here just like primary_color. Step 6b additionally mirrors it into
  // school_branding for older readers that still query that table.
  const update: Record<string, unknown> = {}

  const allowed: (keyof SettingsBody)[] = [
    'name', 'tagline', 'address', 'city', 'state',
    'phone', 'email', 'school_type', 'primary_color', 'secondary_color',
    'font_family', 'logo_url', 'build_image_url',
    'is_publicly_listed', 'description', 'website_url', 'public_email',
    'public_phone', 'admission_status', 'application_deadline',
    'founded_year', 'facilities', 'programs',
  ]

  for (const key of allowed) {
    if (key in body) {
      // Trim strings; keep null as-is (for removals)
      const val = body[key]
      update[key] = typeof val === 'string' ? val.trim() : val
    }
  }

  // website_url gets the same javascript:/data: scheme check every other
  // public-facing link field on the platform uses (see safeUrl.ts) - this
  // is rendered straight into an <a href> on the public school profile.
  if ('website_url' in update) {
    update.website_url = sanitizeOptionalUrl(update.website_url as string | null)
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

  // ── 6b. Mirror branding fields into school_branding ────────────────────────
  // The live theme (SchoolBrandInjector, via each role's layout.tsx) reads
  // primary_color/secondary_color/font_family straight off `schools` now,
  // which step 6 above already wrote. This mirror just keeps the older
  // school_branding table (still read by report-card generation for
  // primary_color/logo_url) in sync so it doesn't drift out of date.
  const brandingUpdate: Record<string, unknown> = {}
  if (update.primary_color   !== undefined) brandingUpdate.primary_color   = update.primary_color
  if (update.secondary_color !== undefined) brandingUpdate.secondary_color = update.secondary_color
  if (update.font_family     !== undefined) brandingUpdate.font_family     = update.font_family

  if (Object.keys(brandingUpdate).length > 0) {
    // school_branding.school_name is NOT NULL with no default - if this
    // school doesn't have a school_branding row yet, an upsert with only
    // colour fields would fail on insert. Carry the name across so the
    // first-ever branding save for a school succeeds instead of erroring.
    const { data: current } = await admin
      .from('schools')
      .select('name')
      .eq('id', profile.school_id)
      .single()

    const { error: brandingError } = await admin
      .from('school_branding')
      .upsert(
        { id: profile.school_id, school_name: current?.name ?? 'School', ...brandingUpdate },
        { onConflict: 'id', ignoreDuplicates: false },
      )

    if (brandingError) {
      console.error('[principal/settings] school_branding sync error:', brandingError)
      // Don't fail the whole request - schools table is already saved.
      // The theme just won't reflect the change until this is retried.
    }
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
