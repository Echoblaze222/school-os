'use client'

// lib/context/CurrencyContext.tsx
// -------------------------------------------------------
// This context powers the currency toggle across the whole
// SchoolOS platform. It sits at the top of the app and
// makes the current currency and conversion function
// available to every component via useCurrency().
//
// Supports 3 exchange rate providers:
//   1. Paystack       — preferred if school uses Paystack
//   2. Flutterwave    — preferred if school uses Flutterwave
//   3. ExchangeRate-API — free fallback, always works
//
// The school picks their provider via feature_flags table.
// If the chosen provider fails, it auto-falls back to the
// next one. If all fail, it uses a safe hardcoded rate.
// -------------------------------------------------------

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  ReactNode,
} from 'react'
import { CurrencyCode } from '@/lib/types'

// -------------------------------------------------------
// TYPES
// -------------------------------------------------------

type CurrencyProvider = 'paystack' | 'flutterwave' | 'exchangerate'

interface CurrencyContextValue {
  // The currently active currency (NGN or USD)
  currency: CurrencyCode

  // The live exchange rate: how many NGN = 1 USD
  // e.g. 1600 means $1 = ₦1,600
  exchangeRate: number

  // Whether the rate is currently being fetched
  isLoading: boolean

  // The provider that successfully gave us the rate
  activeProvider: CurrencyProvider | null

  // Toggle between NGN and USD
  toggle: () => void

  // Convert an NGN amount to the current currency
  // e.g. convert(160000) returns "₦160,000" or "$100.00"
  convert: (amountInNgn: number) => string

  // Get the raw number (without formatting)
  // e.g. convertRaw(160000) returns 160000 or 100
  convertRaw: (amountInNgn: number) => number

  // Format a number in the current currency style
  format: (amount: number) => string
}

// -------------------------------------------------------
// CONTEXT CREATION
// -------------------------------------------------------

const CurrencyContext = createContext<CurrencyContextValue | null>(null)

// -------------------------------------------------------
// FALLBACK RATE
// Used only if ALL providers fail (no internet etc.)
// Update this periodically to keep it roughly accurate.
// -------------------------------------------------------
const FALLBACK_RATE_NGN_PER_USD = 1600

// -------------------------------------------------------
// PROVIDER COMPONENT
// Wrap this around the whole app in layout.tsx
// -------------------------------------------------------

interface CurrencyProviderProps {
  children: ReactNode
  // Which provider to try first — set from school's feature_flags
  preferredProvider?: CurrencyProvider
  // The school's Paystack secret key (server-side only, passed via API route)
  // The school's Flutterwave secret key (server-side only, passed via API route)
}

export function CurrencyProvider({
  children,
  preferredProvider = 'exchangerate',
}: CurrencyProviderProps) {
  const [currency, setCurrency] = useState<CurrencyCode>('NGN')
  const [exchangeRate, setExchangeRate] = useState<number>(FALLBACK_RATE_NGN_PER_USD)
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [activeProvider, setActiveProvider] = useState<CurrencyProvider | null>(null)

  // -------------------------------------------------------
  // FETCH EXCHANGE RATE
  // Tries providers in order: preferred → fallback chain
  // All API calls go through our own Next.js API route
  // (/api/currency/rate) so secret keys stay server-side.
  // -------------------------------------------------------
  const fetchRate = useCallback(async () => {
    setIsLoading(true)

    // Build the provider order: preferred first, then the others
    const providerOrder: CurrencyProvider[] = [
      preferredProvider,
      ...(['paystack', 'flutterwave', 'exchangerate'] as CurrencyProvider[]).filter(
        p => p !== preferredProvider
      ),
    ]

    for (const provider of providerOrder) {
      try {
        // Call our internal API route — never call external APIs directly
        // from the browser (keys would be exposed)
        const response = await fetch(`/api/currency/rate?provider=${provider}`, {
          // Cache for 10 minutes — rates don't change that fast
          next: { revalidate: 600 },
        } as RequestInit)

        if (!response.ok) throw new Error(`${provider} returned ${response.status}`)

        const data = await response.json()

        if (data.rate && typeof data.rate === 'number' && data.rate > 0) {
          setExchangeRate(data.rate)
          setActiveProvider(provider)
          setIsLoading(false)
          return // Success — stop trying other providers
        }
      } catch (error) {
        // This provider failed — try the next one silently
        console.warn(`SchoolOS Currency: ${provider} failed, trying next provider...`)
        continue
      }
    }

    // All providers failed — use fallback rate
    console.warn('SchoolOS Currency: All providers failed. Using fallback rate.')
    setExchangeRate(FALLBACK_RATE_NGN_PER_USD)
    setActiveProvider(null)
    setIsLoading(false)
  }, [preferredProvider])

  // Fetch the rate when the app loads
  useEffect(() => {
    fetchRate()

    // Refresh the rate every 10 minutes while the app is open
    const interval = setInterval(fetchRate, 10 * 60 * 1000)
    return () => clearInterval(interval)
  }, [fetchRate])

  // -------------------------------------------------------
  // TOGGLE
  // Switches between NGN and USD
  // -------------------------------------------------------
  const toggle = useCallback(() => {
    setCurrency(prev => (prev === 'NGN' ? 'USD' : 'NGN'))
  }, [])

  // -------------------------------------------------------
  // CONVERT
  // Converts an NGN amount and returns a formatted string.
  // e.g. convert(160000) → "₦160,000" or "$100.00"
  // -------------------------------------------------------
  const convert = useCallback(
    (amountInNgn: number): string => {
      if (currency === 'NGN') {
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }).format(amountInNgn)
      } else {
        const usdAmount = amountInNgn / exchangeRate
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }).format(usdAmount)
      }
    },
    [currency, exchangeRate]
  )

  // -------------------------------------------------------
  // CONVERT RAW
  // Returns the raw number without formatting
  // e.g. convertRaw(160000) → 160000 or 100
  // -------------------------------------------------------
  const convertRaw = useCallback(
    (amountInNgn: number): number => {
      if (currency === 'NGN') return amountInNgn
      return amountInNgn / exchangeRate
    },
    [currency, exchangeRate]
  )

  // -------------------------------------------------------
  // FORMAT
  // Formats a number that's already in the current currency
  // -------------------------------------------------------
  const format = useCallback(
    (amount: number): string => {
      if (currency === 'NGN') {
        return new Intl.NumberFormat('en-NG', {
          style: 'currency',
          currency: 'NGN',
          minimumFractionDigits: 0,
        }).format(amount)
      } else {
        return new Intl.NumberFormat('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 2,
        }).format(amount)
      }
    },
    [currency]
  )

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        exchangeRate,
        isLoading,
        activeProvider,
        toggle,
        convert,
        convertRaw,
        format,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  )
}

// -------------------------------------------------------
// HOOK
// Use this in any component to access currency functions.
//
// Example usage:
//   const { currency, convert, toggle } = useCurrency()
//   <p>{convert(150000)}</p>  // shows ₦150,000 or $93.75
//   <button onClick={toggle}>Switch Currency</button>
// -------------------------------------------------------
export function useCurrency(): CurrencyContextValue {
  const context = useContext(CurrencyContext)
  if (!context) {
    throw new Error('useCurrency must be used inside a CurrencyProvider')
  }
  return context
}
