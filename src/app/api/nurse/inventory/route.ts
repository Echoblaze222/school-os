// src/app/api/nurse/inventory/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAppointment } from '@/lib/permissions'

async function requireNurse() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('profiles').select('id, school_id').eq('id', user.id).single()
  if (!profile?.school_id) return null
  const isNurse = await hasActiveAppointment(supabase, user.id, profile.school_id, 'nurse')
  if (!isNurse) return null
  return { userId: user.id, schoolId: profile.school_id }
}

export async function GET() {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('clinic_inventory')
    .select('*')
    .eq('school_id', caller.schoolId)
    .order('item_name')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, items: data ?? [] })
}

export async function POST(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.itemName) return NextResponse.json({ ok: false, error: 'itemName is required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: item, error } = await admin
    .from('clinic_inventory')
    .insert({
      school_id: caller.schoolId,
      item_name: String(body.itemName).trim(),
      category: body.category ? String(body.category).trim() : null,
      quantity_on_hand: Number(body.quantityOnHand ?? 0),
      unit: body.unit ? String(body.unit).trim() : 'units',
      reorder_level: Number(body.reorderLevel ?? 5),
      last_restocked_at: body.quantityOnHand > 0 ? new Date().toISOString() : null,
      notes: body.notes ? String(body.notes).trim() : null,
      updated_by: caller.userId,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item })
}

export async function PATCH(request: Request) {
  const caller = await requireNurse()
  if (!caller) return NextResponse.json({ ok: false, error: 'Not authorized.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  if (!body?.id) return NextResponse.json({ ok: false, error: 'id is required.' }, { status: 400 })

  const admin = createAdminClient()
  const update: Record<string, unknown> = { updated_by: caller.userId, updated_at: new Date().toISOString() }
  if (body.quantityOnHand !== undefined) {
    update.quantity_on_hand = Number(body.quantityOnHand)
    update.last_restocked_at = new Date().toISOString()
  }
  if (body.reorderLevel !== undefined) update.reorder_level = Number(body.reorderLevel)
  if (body.notes !== undefined) update.notes = body.notes ? String(body.notes).trim() : null

  const { data: item, error } = await admin
    .from('clinic_inventory')
    .update(update)
    .eq('id', body.id)
    .eq('school_id', caller.schoolId)
    .select('*')
    .single()

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, item })
}
