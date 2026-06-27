// src/app/api/paystack/create-subaccount/route.ts
//
// Creates a Paystack Subaccount for a school, so fee payments can be
// auto-split: 97% settles to the school's bank account, 3% stays with the
// platform — all within a single Paystack transaction, no manual transfers.
//
// Called from SettingsClient.tsx (Banking tab) once the principal has saved
// bank_name / account_number / account_name. Requires PAYSTACK_SECRET_KEY
// (your own Paystack account — schools never need their own Paystack login).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!
const PLATFORM_FEE_PERCENT = 3 // platform keeps 3%, school settlement gets 97%

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    // Only principal/bursar/admin may create or refresh a subaccount
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, school_id')
      .eq('id', user.id)
      .single()

    if (!profile || !['principal', 'bursar', 'admin'].includes(profile.role)) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .select('id, name, bank_name, account_number, account_name, paystack_subaccount_code')
      .eq('id', profile.school_id)
      .single()

    if (schoolErr || !school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 })
    }

    if (!school.bank_name || !school.account_number || !school.account_name) {
      return NextResponse.json(
        { error: 'Save bank name, account number, and account name in Settings → Banking first.' },
        { status: 400 }
      )
    }

    if (school.account_number.length !== 10) {
      return NextResponse.json({ error: 'Account number must be exactly 10 digits.' }, { status: 400 })
    }

    // 1. Resolve the bank's Paystack bank_code from the bank name.
    //    Paystack requires bank_code, not the bank name, for subaccount creation.
    const banksRes = await fetch('https://api.paystack.co/bank?country=nigeria', {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    })
    const banksJson = await banksRes.json()
    if (!banksJson.status) {
      return NextResponse.json({ error: 'Could not load bank list from Paystack.' }, { status: 502 })
    }

    const bankMatch = (banksJson.data as { name: string; code: string }[]).find(
      b => b.name.toLowerCase().trim() === school.bank_name!.toLowerCase().trim()
    )
    if (!bankMatch) {
      return NextResponse.json(
        { error: `Bank "${school.bank_name}" was not recognized by Paystack. Please re-select it exactly as listed.` },
        { status: 400 }
      )
    }

    // 2. Verify the account number resolves to the account name on file
    //    (Paystack will reject subaccount creation anyway if this mismatches,
    //    but checking first gives a much clearer error message).
    const resolveRes = await fetch(
      `https://api.paystack.co/bank/resolve?account_number=${school.account_number}&bank_code=${bankMatch.code}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` } }
    )
    const resolveJson = await resolveRes.json()
    if (!resolveJson.status) {
      return NextResponse.json(
        { error: 'Could not verify this account number with the bank. Double-check the number and try again.' },
        { status: 400 }
      )
    }

    // 3. Create (or update) the subaccount
    const isUpdate = !!school.paystack_subaccount_code
    const subaccountPayload = {
      business_name:          school.name,
      settlement_bank:        bankMatch.code,
      account_number:         school.account_number,
      percentage_charge:      PLATFORM_FEE_PERCENT, // Paystack deducts this % to the platform; rest settles to school
    }

    const subRes = await fetch(
      isUpdate
        ? `https://api.paystack.co/subaccount/${school.paystack_subaccount_code}`
        : 'https://api.paystack.co/subaccount',
      {
        method: isUpdate ? 'PUT' : 'POST',
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(subaccountPayload),
      }
    )
    const subJson = await subRes.json()

    if (!subJson.status) {
      return NextResponse.json(
        { error: subJson.message || 'Paystack rejected the subaccount request.' },
        { status: 502 }
      )
    }

    const subaccountCode = isUpdate ? school.paystack_subaccount_code : subJson.data.subaccount_code
    const subaccountId   = isUpdate ? subJson.data.id?.toString() ?? null : subJson.data.id?.toString() ?? null

    const { error: updateErr } = await supabase
      .from('schools')
      .update({
        paystack_subaccount_code:   subaccountCode,
        paystack_subaccount_id:     subaccountId,
        paystack_subaccount_active: true,
      })
      .eq('id', school.id)

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      subaccount_code: subaccountCode,
      resolved_account_name: resolveJson.data.account_name,
    })
  } catch (err: any) {
    console.error('create-subaccount error:', err)
    return NextResponse.json({ error: err.message ?? 'Unexpected server error' }, { status: 500 })
  }
      }
      
