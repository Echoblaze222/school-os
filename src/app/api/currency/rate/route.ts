// src/app/api/currency/rate/route.ts
import { NextResponse } from 'next/server'

type Provider = 'paystack' | 'flutterwave' | 'exchangerate'

const FALLBACK_RATE = 1600

// ── Paystack ──────────────────────────────────────────────────
async function fetchFromPaystack(): Promise<number> {
  const key = process.env.PAYSTACK_SECRET_KEY
  if (!key) throw new Error('PAYSTACK_SECRET_KEY not set')

  const res = await fetch('https://api.paystack.co/currency', {
    headers: { Authorization: `Bearer ${key}` },
  })
  if (!res.ok) throw new Error(`Paystack HTTP ${res.status}`)

  const json = await res.json()
  const usdEntry = json?.data?.find(
    (e: { currency: string }) => e.currency === 'USD'
  )
  const rate = usdEntry?.amount_in_ngn
  if (!rate || typeof rate !== 'number') throw new Error('Paystack: bad response shape')
  return rate
}

// ── Flutterwave ───────────────────────────────────────────────
async function fetchFromFlutterwave(): Promise<number> {
  const key = process.env.FLUTTERWAVE_SECRET_KEY
  if (!key) throw new Error('FLUTTERWAVE_SECRET_KEY not set')

  const res = await fetch(
    'https://api.flutterwave.com/v3/transfers/rates?amount=1&destination_currency=NGN&source_currency=USD',
    { headers: { Authorization: `Bearer ${key}` } }
  )
  if (!res.ok) throw new Error(`Flutterwave HTTP ${res.status}`)

  const json = await res.json()
  const rate = json?.data?.rate
  if (!rate || typeof rate !== 'number') throw new Error('Flutterwave: bad response shape')
  return rate
}

// ── ExchangeRate-API ──────────────────────────────────────────
async function fetchFromExchangeRate(): Promise<number> {
  const key = process.env.EXCHANGE_RATE_API_KEY

  const url = key
    ? `https://v6.exchangerate-api.com/v6/${key}/pair/USD/NGN`
    : 'https://open.er-api.com/v6/latest/USD'

  const res = await fetch(url)
  if (!res.ok) throw new Error(`ExchangeRate-API HTTP ${res.status}`)

  const json = await res.json()
  const rate: number = key ? json?.conversion_rate : json?.rates?.NGN
  if (!rate || typeof rate !== 'number') throw new Error('ExchangeRate-API: bad response shape')
  return rate
}

// ── Provider map ──────────────────────────────────────────────
const FETCHERS: Record<Provider, () => Promise<number>> = {
  paystack:     fetchFromPaystack,
  flutterwave:  fetchFromFlutterwave,
  exchangerate: fetchFromExchangeRate,
}

const ALL_PROVIDERS: Provider[] = ['paystack', 'flutterwave', 'exchangerate']

// ── Route handler ─────────────────────────────────────────────
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const requested = searchParams.get('provider') as Provider | null

  const order: Provider[] =
    requested && ALL_PROVIDERS.includes(requested)
      ? [requested, ...ALL_PROVIDERS.filter(p => p !== requested)]
      : ALL_PROVIDERS

  for (const provider of order) {
    try {
      const rate = await FETCHERS[provider]()
      return NextResponse.json({ rate, provider })
    } catch (err) {
      console.warn(`[currency/rate] ${provider} failed:`, (err as Error).message)
    }
  }

  console.error('[currency/rate] All providers failed — returning fallback rate')
  return NextResponse.json({ rate: FALLBACK_RATE, provider: 'fallback' })
}
