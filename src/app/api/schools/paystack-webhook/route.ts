// src/app/api/schools/paystack-webhook/route.ts
// Paystack POSTs here directly (server-to-server) on every payment event.
// More reliable than the callback — fires even if the user closes their browser mid-payment.
// Set this URL in Paystack → Settings → API Keys & Webhooks → Webhook URL

import { NextResponse }   from 'next/server'
import { createHmac }     from 'crypto'
import { activateSchool } from '@/lib/activateSchool'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: Request) {
  try {
    const rawBody  = await request.text()
    const signature = request.headers.get('x-paystack-signature') ?? ''

    // 1. Verify the request is genuinely from Paystack
    const hash = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY!)
      .update(rawBody)
      .digest('hex')

    if (hash !== signature) {
      console.warn('Webhook signature mismatch — ignored')
      return NextResponse.json({ ok: false }, { status: 401 })
    }

    const event = JSON.parse(rawBody)

    // 2. Only handle successful charge events
    if (event.event !== 'charge.success') {
      return NextResponse.json({ ok: true }) // acknowledge other events
    }

    const schoolId   = event.data?.metadata?.school_id
    const plan       = event.data?.metadata?.plan ?? 'Basic'
    const amountKobo = event.data?.amount ?? 0
    const reference  = event.data?.reference

    if (!schoolId || !reference) {
      return NextResponse.json({ ok: true }) // not a school registration payment
    }

    // 3. Check if this reference was already processed (idempotency)
    //    Paystack can fire webhooks more than once for the same payment
    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('schools')
      .select('status, is_platform_active')
      .eq('id', schoolId)
      .single()

    if (existing?.status === 'active' && existing?.is_platform_active === true) {
      // Already activated (callback got here first) — skip silently
      return NextResponse.json({ ok: true })
    }

    // 4. Activate school + send super admin notification
    await activateSchool(schoolId, plan, amountKobo)

    return NextResponse.json({ ok: true })

  } catch (error) {
    console.error('Webhook error:', error)
    // Always return 200 to Paystack — otherwise they retry repeatedly
    return NextResponse.json({ ok: true })
  }
}
