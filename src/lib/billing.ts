// src/lib/billing.ts
//
// Single source of truth for money math. Before this file existed, the
// subscription tier thresholds were duplicated in
// /api/subscription/renew/route.ts and SubscriptionClient.tsx - and the
// two copies had already drifted (see git history / the two tier-label
// strings that no longer matched each other). Worse: BOTH copies used
// 150/250 as the tier breakpoints, when the actual pricing model is
// 250/500 - every school with 151-500 active students was being quoted
// and charged roughly double what they should have been.
//
// Import from here anywhere money needs to be calculated. Never
// reimplement these thresholds locally - that's exactly how the bug
// above happened.

export type BillingCycle = 'termly' | 'yearly'

export interface SubscriptionTier {
  rate: number       // NGN per student, per term
  tierLabel: string
}

// NGN per active student, per 4-month term.
export function getSubscriptionTier(activeStudentCount: number): SubscriptionTier {
  if (activeStudentCount <= 250) return { rate: 1000, tierLabel: 'Starter (up to 250 students)' }
  if (activeStudentCount <= 500) return { rate: 2000, tierLabel: 'Growth (251-500 students)' }
  return { rate: 3000, tierLabel: 'Scale (501+ students)' }
}

// A full academic year is 3 terms. 20% off if paid as a single yearly
// charge instead of three separate termly ones.
const YEARLY_TERM_COUNT = 3
const YEARLY_DISCOUNT_RATE = 0.20

export interface SubscriptionAmount {
  studentCount: number
  ratePerStudent: number
  tierLabel: string
  billingCycle: BillingCycle
  termlyAmount: number     // one term, undiscounted
  amount: number           // what actually gets charged for the chosen cycle
  discountApplied: number  // NGN saved vs. paying termly repeatedly, 0 for termly
}

export function computeSubscriptionAmount(activeStudentCount: number, billingCycle: BillingCycle = 'termly'): SubscriptionAmount {
  const { rate, tierLabel } = getSubscriptionTier(activeStudentCount)
  const termlyAmount = activeStudentCount * rate

  if (billingCycle === 'yearly') {
    const undiscountedYearly = termlyAmount * YEARLY_TERM_COUNT
    const amount = Math.round(undiscountedYearly * (1 - YEARLY_DISCOUNT_RATE))
    return {
      studentCount: activeStudentCount, ratePerStudent: rate, tierLabel, billingCycle,
      termlyAmount, amount, discountApplied: undiscountedYearly - amount,
    }
  }

  return {
    studentCount: activeStudentCount, ratePerStudent: rate, tierLabel, billingCycle: 'termly',
    termlyAmount, amount: termlyAmount, discountApplied: 0,
  }
}

// ─── Platform fee on parent → school fee payments (Paystack subaccount split) ───
//
// A flat percentage split (what create-subaccount/route.ts configures on
// the Paystack subaccount itself) has no way to express a cap - Paystack's
// subaccount percentage_charge is just a flat %, applied to every
// transaction regardless of size. On a ₦500,000 school-fee payment, a
// flat 3% is ₦15,000, well past the ₦10,000 cap this is supposed to
// enforce. Getting an actual cap requires computing the fee here and
// passing it as an explicit transaction_charge (an absolute kobo amount)
// on each individual Paystack initialize call, which overrides that
// transaction's split regardless of what the subaccount's default is.
export const PLATFORM_FEE_PERCENT = 3
export const PLATFORM_FEE_CAP_NGN = 10000

export interface PlatformFeeBreakdown {
  grossAmountNgn: number
  platformFeeNgn: number
  schoolAmountNgn: number
}

export function computePlatformFee(grossAmountNgn: number): PlatformFeeBreakdown {
  const uncapped = grossAmountNgn * (PLATFORM_FEE_PERCENT / 100)
  const platformFeeNgn = Math.min(Math.round(uncapped), PLATFORM_FEE_CAP_NGN)
  return {
    grossAmountNgn,
    platformFeeNgn,
    schoolAmountNgn: grossAmountNgn - platformFeeNgn,
  }
}

// ─── Subscription lifecycle ─────────────────────────────────────────────
//
// How long a school keeps full access after its subscription_ends date
// passes, before being restricted. See lib/subscriptionExpiry.ts - this
// used to be zero: the moment subscription_ends passed, setup_status went
// straight from 'active' to 'suspended' with no warning period at all.
export const GRACE_PERIOD_DAYS = 7

// ─── Anti-gaming: bill on peak enrollment, not instantaneous count ──────
//
// Billing purely on "how many active students right now" is gameable:
// bulk-deactivate most students right before renewal, pay the tiny
// resulting bill, reactivate everyone once the new subscription_ends date
// is locked in. schools.peak_active_student_count tracks the highest
// active count seen at any point during the CURRENT billing period
// (subscriptionExpiry.ts updates it; activateSubscription resets it to
// the freshly-billed count at the start of each new period) - billing
// uses the higher of that and the live count, so a pre-renewal dip never
// lowers what's actually charged.
export function computeBillableStudentCount(liveActiveCount: number, peakActiveCount: number | null | undefined): number {
  return Math.max(liveActiveCount, peakActiveCount ?? 0)
}
