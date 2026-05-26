import { NextResponse } from 'next/server'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const provider = searchParams.get('provider') || 'exchangerate'

  try {
    let rate = null

    if (provider === 'exchangerate') {
      const apiKey = process.env.EXCHANGE_RATE_API_KEY
      if (apiKey) {
        const response = await fetch(`https://v6.exchangerate-api.com/v6/${apiKey}/pair/USD/NGN`)
        if (response.ok) {
          const data = await response.json()
          if (data?.conversion_rate) rate = parseFloat(data.conversion_rate)
        }
      }
    }

    if (rate && rate > 0) {
      return NextResponse.json({ rate, provider })
    }

    return NextResponse.json({ rate: 1600, provider: 'fallback' })

  } catch {
    return NextResponse.json({ rate: 1600, provider: 'fallback' })
  }
}
