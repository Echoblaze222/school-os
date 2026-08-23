// src/app/api/ict/assets/route.ts
// GET/POST for the device/equipment inventory (§10). Read is broader
// than ICT via RLS (any school member can see e.g. "projector under
// repair"), but create/full-detail here is ICT-only, matching the
// permission matrix's "ICT Officer: Create" row.

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { requireIctAccess } from '@/lib/permissions'

const DEVICE_TYPES = ['computer', 'laptop', 'tablet', 'printer', 'scanner', 'projector', 'smart_board', 'router', 'access_point', 'other']

async function getCaller() {
  const cookieStore = await cookies()
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        },
      },
    },
  )
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabaseAuth.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile) return null
  return { user, profile }
}

export async function GET(request: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const url = new URL(request.url)
  const status = url.searchParams.get('status')
  const deviceType = url.searchParams.get('device_type')

  // Non-ICT callers still get a read (any school member can see status of
  // shared equipment), but purchase_cost_kobo is stripped for them below:
  // that column is financial data, §9's "authorized" gate.
  const isIct = await requireIctAccess(admin, caller.user.id, caller.profile.school_id)

  let query = admin
    .from('ict_assets')
    .select(isIct
      ? '*'
      : 'id, asset_tag, device_type, name, location, status, condition, assigned_to_profile, assigned_to_dept')
    .eq('school_id', caller.profile.school_id)
    .order('asset_tag', { ascending: true })
    .limit(500) // §33 performance: was unbounded; asset count can grow into the hundreds for a large school

  if (status) query = query.eq('status', status)
  if (deviceType) query = query.eq('device_type', deviceType)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ assets: data })
}

export async function POST(request: Request) {
  const caller = await getCaller()
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const allowed = await requireIctAccess(admin, caller.user.id, caller.profile.school_id)
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const { assetTag, deviceType, name, serialNumber, location, assignedToProfile, assignedToDept,
          purchaseDate, purchaseCostKobo, warrantyExpiresAt, notes } = body

  if (!assetTag || !deviceType || !name) {
    return NextResponse.json({ error: 'assetTag, deviceType, and name are required.' }, { status: 400 })
  }
  if (!DEVICE_TYPES.includes(deviceType)) {
    return NextResponse.json({ error: 'Invalid deviceType.' }, { status: 400 })
  }

  const { data: asset, error } = await admin
    .from('ict_assets')
    .insert({
      school_id: caller.profile.school_id,
      asset_tag: assetTag, device_type: deviceType, name,
      serial_number: serialNumber ?? null, location: location ?? null,
      assigned_to_profile: assignedToProfile ?? null, assigned_to_dept: assignedToDept ?? null,
      purchase_date: purchaseDate ?? null, purchase_cost_kobo: purchaseCostKobo ?? null,
      warranty_expires_at: warrantyExpiresAt ?? null, notes: notes ?? null,
      created_by: caller.user.id,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `Asset tag "${assetTag}" is already in use.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, assetId: asset.id })
}
