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
export interface School {
  id: string
  name: string
  slug: string
  school_type: 'primary' | 'secondary' | 'combined'
  status: 'pending' | 'active' | 'suspended' | 'archived'
  address: string | null
  city: string | null
  state: string | null
  country: string
  phone: string | null
  email: string | null
  primary_color: string
  secondary_color: string | null
  logo_url: string | null
  login_bg_image: string | null
  font_family: string
  tagline: string | null
  currency_primary: 'NGN' | 'USD'
  currency_secondary: 'NGN' | 'USD' | null
  principal_id: string | null
  is_platform_active: boolean
  registered_at: string
}

// Supported currencies
export type CurrencyCode = 'NGN' | 'USD'

// The main Database type Supabase uses for autocompletion
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile
        Insert: Partial<Profile> & { id: string; role: UserRole; full_name: string; email: string }
        Update: Partial<Profile>
      }
      schools: {
        Row: School
        Insert: Partial<School> & { name: string; slug: string }
        Update: Partial<School>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      onboarding_stage: OnboardingStage
    }
  }
}
