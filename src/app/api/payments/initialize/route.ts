// src/app/api/payments/initialize/route.ts
//
// Parent taps "Pay with Paystack" on an invoice in FeesClient.tsx → this route
// creates a Paystack transaction split between the school's subaccount (97%)
// and the platform (3%), and returns the authorization_url to redirect to.
//
// Money settles directly to the SCHOOL's bank account via their subaccount —
// your Paystack account is only the processor, never holds the school's share.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY!
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://school-os-j4bn.vercel.app'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authErr } = await supabase.auth.getUser()
    if (authErr || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const { invoiceId } = await req.json()
    if (!invoiceId) {
      return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })
    }

    // Load the invoice and confirm it actually belongs to one of this
    // parent's linked children — never trust invoiceId alone.
    const { data: invoice, error: invErr } = await supabase
      .from('payment_invoices')
      .select(`
        id, student_id, school_id, balance_ngn, status,
        profiles!student_id ( full_name, parent_id ),
        fee_structures ( description, term, academic_year )
      `)
      .eq('id', invoiceId)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
    }

    const studentRow = Array.isArray(invoice.profiles) ? invoice.profiles[0] : invoice.profiles
    if (studentRow?.parent_id !== user.id) {
      return NextResponse.json({ error: 'This invoice does not belong to your child.' }, { status: 403 })
    }

    if (invoice.status === 'paid' || invoice.balance_ngn <= 0) {
      return NextResponse.json({ error: 'This invoice is already fully paid.' }, { status: 400 })
    }

    // Load the school's subaccount — required for the split to work
    const { data: school, error: schoolErr } = await supabase
      .from('schools')
      .select('id, name, paystack_subaccount_code, paystack_subaccount_active')
      .eq('id', invoice.school_id)
      .single()

    if (schoolErr || !school) {
      return NextResponse.json({ error: 'School not found' }, { status: 404 })
    }

    if (!school.paystack_subaccount_active || !school.paystack_subaccount_code) {
      return NextResponse.json(
        { error: 'Online payment is not yet set up for this school. Please pay via bank transfer instead.' },
        { status: 400 }
      )
    }

    // Get the parent's email for Paystack (required field)
    const { data: parentProfile } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', user.id)
      .single()

    if (!parentProfile?.email) {
      return NextResponse.json({ error: 'No email on file for your account.' }, { status: 400 })
    }

    const amountKobo = Math.round(invoice.balance_ngn * 100) // Paystack uses kobo
    const reference   = `SCHOS-${invoice.id.slice(0, 8)}-${Date.now()}`

    const initRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: parentProfile.email,
        amount: amountKobo,
        reference,
        subaccount: school.paystack_subaccount_code,
        bearer: 'subaccount', // school's subaccount bears the Paystack transaction fee, not the platform
        callback_url: `${APP_URL}/dashboard/parent/fees?payment=callback`,
        metadata: {
          invoice_id: invoice.id,
          student_id: invoice.student_id,
          school_id: invoice.school_id,
          parent_id: user.id,
        },
      }),
    })

    const initJson = await initRes.json()
    if (!initJson.status) {
      return NextResponse.json({ error: initJson.message || 'Paystack initialization failed.' }, { status: 502 })
    }

    // Record the reference on the invoice so we can reconcile even if the
    // webhook is delayed and the parent checks back before it arrives.
    await supabase
      .from('payment_invoices')
      .update({ last_paystack_reference: reference })
      .eq('id', invoice.id)

    return NextResponse.json({
      authorization_url: initJson.data.authorization_url,
      reference,
    })
  } catch (err: any) {
    console.error('payment initialize error:', err)
    return NextResponse.json({ error: err.message ?? 'Unexpected server error' }, { status: 500 })
  }
                   }
                                                                                          
