// app/api/currency/route.ts
import { NextResponse } from 'next/server'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const amount   = parseFloat(searchParams.get('amount') ?? '1')
  const from     = searchParams.get('from')?.toUpperCase() ?? 'NGN'
  const to       = searchParams.get('to')?.toUpperCase()   ?? 'USD'

  // Static fallback rates (update periodically or use an API)
  const RATES: Record<string, number> = {
    NGN: 1,
    USD: 0.00065,   // ~₦1,540/$ — update as needed
    GBP: 0.00052,
    EUR: 0.00060,
  }

  const fromRate = RATES[from]
  const toRate   = RATES[to]

  if (!fromRate || !toRate) {
    return NextResponse.json({ error: `Unsupported currency: ${from} or ${to}` }, { status: 400 })
  }

  const converted = (amount / fromRate) * toRate

  return NextResponse.json({
    from, to, amount,
    converted: Math.round(converted * 100) / 100,
    rate:      toRate / fromRate,
  })
}
