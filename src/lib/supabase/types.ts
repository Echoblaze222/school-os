// lib/supabase/types.ts
// -------------------------------------------------------
// TypeScript types for the entire SchoolOS platform.
// These match the tables in the Supabase database.
// Keep these in sync whenever you change the database.
// -------------------------------------------------------

// The 6 user roles in the system
export type UserRole =
  | 'student'
  | 'teacher'
  | 'principal'
  | 'bursar'
  | 'secretary'
  | 'parent'

// The 3-stage onboarding journey
export type OnboardingStage =
  | 'stage_1_pending'
  | 'stage_2_pending'
  | 'stage_3_pending'
  | 'complete'

// Maps each onboarding stage to the page the user should be on.
// The middleware reads this to enforce the correct stage.
export const STAGE_ROUTES: Record<OnboardingStage, string> = {
  stage_1_pending: '/login',
  stage_2_pending: '/onboarding/stage-2',
  stage_3_pending: '/onboarding/stage-3',
  complete: '/dashboard',
}

// Maps each role to their specific dashboard URL.
// The middleware reads this to enforce role-based routing.
// A student typing /dashboard/principal gets redirected to /dashboard/student.
export const ROLE_DASHBOARDS: Record<UserRole, string> = {
  student:   '/dashboard/student',
  teacher:   '/dashboard/teacher',
  principal: '/dashboard/principal',
  bursar:    '/dashboard/bursar',
  secretary: '/dashboard/secretary',
  parent:    '/dashboard/parent',
}

// The shape of a row in the profiles table
export interface Profile {
  id: string
  role: UserRole
  full_name: string
  email: string
  phone: string | null
  date_of_birth: string | null
  gender: 'male' | 'female' | 'other' | null
  address: string | null
  onboarding_stage: OnboardingStage
  default_code: string | null
  secret_identifier: string | null
  passport_url: string | null
  // ✅ correct column names — nin_number does NOT exist
  nin_screenshot_url: string | null
  nin_verified: boolean
  nin_verified_at: string | null
  avatar_url: string | null
  is_active: boolean
  school_id: string | null
  parent_id: string | null
  permanent_student_id: string | null
  lifecycle_status: string | null
  created_at: string
  updated_at: string
}

// The shape of a row in the schools table
// ✅ Fixed: aligned with the actual columns that exist (and are now added via migration)
// Key corrections vs old version:
//   - status → setup_status (correct column name)
//   - registered_at → created_at (correct column name)
//   - principal_id removed (column does not exist; principal is linked via profiles.school_id)
//   - Added: font_family, secondary_color, login_bg_image, currency_primary, currency_secondary
//     (added by fix-schools-branding-columns.sql migration)
export interface School {
  id: string
  name: string
  slug: string
  school_type: 'primary' | 'secondary' | 'combined' | string | null
  // ✅ correct column name — was 'status' in the old interface
  setup_status: 'trial' | 'active' | 'expired' | 'suspended' | 'locked'
  address: string | null
  city: string | null
  state: string | null
  country: string
  phone: string | null
  email: string | null
  primary_color: string
  // ✅ branding columns now exist on schools (via migration)
  secondary_color: string | null
  logo_url: string | null
  login_bg_image: string | null
  build_image_url: string | null
  font_family: string
  tagline: string | null
  currency_primary: string
  currency_secondary: string | null
  is_platform_active: boolean
  // ✅ correct column name — was 'registered_at' in old interface
  created_at: string
  updated_at: string
  // Trial / subscription fields (added by trial-subscription-schema.sql)
  trial_started_at: string | null
  trial_ends_at: string | null
  setup_paid_at: string | null
  free_month_starts: string | null
  free_month_ends: string | null
  subscription_plan: string | null
  subscription_starts: string | null
  subscription_ends: string | null
  notes: string | null
}

// Supported currencies
export type CurrencyCode = 'NGN' | 'USD'
