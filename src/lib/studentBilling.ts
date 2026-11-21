// src/lib/studentBilling.ts
//
// Per-student subscription pricing. Each student pays once per school term.
// The rate comes from the SAME size-based tiers as before (lib/billing.ts),
// looked up from the school's active student count server-side, so a payer can
// never influence the price. Nobody below the platform sees the tier maths.

import { getSubscriptionTier } from '@/lib/billing'

export const STUDENT_REFERENCE_PREFIX = 'SCSUB-'

export interface StudentSubscriptionPrice {
  amount: number        // NGN, what this ONE student pays for the term
  tierLabel: string
}

export function priceForStudent(schoolActiveStudentCount: number): StudentSubscriptionPrice {
  const { rate, tierLabel } = getSubscriptionTier(schoolActiveStudentCount)
  return { amount: rate, tierLabel }
}
