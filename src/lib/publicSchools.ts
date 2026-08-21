// src/lib/publicSchools.ts
// Shared server-side helpers for the public platform (Lane A/B, §38-39, 45).
//
// SECURITY: `schools` holds sensitive columns (bank_name, account_number,
// account_name, email, phone, notes, principal_id, paystack_subaccount_*,
// trial/subscription dates): the same reason /api/schools/search already
// uses the admin/service-role client with an explicit column allowlist
// instead of ever running `select('*')`. Every function here follows that
// same pattern: list the exact public-safe columns, nothing wider. If you
// need one more field on the public profile, add it to PUBLIC_SCHOOL_FIELDS
// below deliberately: don't switch to '*'.
//
// These helpers assume the caller already has a service-role client
// (createAdminClient()): they do not create one, so they can't
// accidentally be imported into client-side ('use client') code.

import type { SupabaseClient } from '@supabase/supabase-js'

// Columns safe to return to an unauthenticated visitor. Everything here is
// information the school explicitly published by turning on
// is_publicly_listed and filling in its public profile: never billing,
// contact-for-login, or internal-operations data.
export const PUBLIC_SCHOOL_FIELDS = `
  id, name, slug, city, state, country, school_type,
  logo_url, cover_image_url, tagline, description, website_url,
  education_levels, is_boarding, is_day, verified_status,
  facilities, programs, admission_status, application_deadline,
  public_email, public_phone, social_links, founded_year,
  primary_color, secondary_color, is_platform_active
`.replace(/\s+/g, ' ').trim()

// Narrower set for directory/list cards: avoids sending long description
// text and full facility/program arrays for every row of a search result.
export const PUBLIC_SCHOOL_LIST_FIELDS = `
  id, name, slug, city, state, school_type,
  logo_url, cover_image_url, tagline,
  education_levels, is_boarding, is_day, verified_status,
  primary_color
`.replace(/\s+/g, ' ').trim()

export interface PublicSchoolListItem {
  id: string
  name: string
  slug: string
  city: string | null
  state: string | null
  school_type: string
  logo_url: string | null
  cover_image_url: string | null
  tagline: string | null
  education_levels: string[]
  is_boarding: boolean
  is_day: boolean
  verified_status: 'unverified' | 'pending' | 'verified'
  primary_color: string
}

export interface PublicSchoolProfile extends PublicSchoolListItem {
  country: string | null
  description: string | null
  website_url: string | null
  facilities: string[]
  programs: string[]
  admission_status: 'open' | 'closed' | 'waitlist'
  application_deadline: string | null
  public_email: string | null
  public_phone: string | null
  social_links: Record<string, string>
  founded_year: number | null
  secondary_color: string | null
  is_platform_active: boolean
}

export interface DiscoveryFilters {
  q?: string
  state?: string
  schoolType?: string
  educationLevel?: string
  boarding?: 'boarding' | 'day' | 'both'
  verifiedOnly?: boolean
  limit?: number
  offset?: number
}

// Controlled vocabularies shared by the discovery filter UI and the
// principal-side public profile settings form, so a school can only pick
// values the search filters actually understand.
export const EDUCATION_LEVELS = ['Nursery', 'Primary', 'Junior Secondary', 'Senior Secondary'] as const
export const SCHOOL_TYPES = ['primary', 'secondary', 'combined'] as const
export const NIGERIAN_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT Abuja', 'Gombe',
  'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos',
  'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto',
  'Taraba', 'Yobe', 'Zamfara',
] as const

const MAX_LIMIT = 24

/**
 * Public school directory search: the query behind /find-schools (§39).
 * Only ever returns rows where is_publicly_listed AND is_platform_active
 * are both true: an unlisted school, or one locked/suspended by
 * super-admin, never appears here even if someone guesses filter values.
 */
export async function searchPublicSchools(
  admin: SupabaseClient,
  filters: DiscoveryFilters
): Promise<{ schools: PublicSchoolListItem[]; total: number }> {
  const limit = Math.min(Math.max(filters.limit ?? MAX_LIMIT, 1), MAX_LIMIT)
  const offset = Math.max(filters.offset ?? 0, 0)

  let query = admin
    .from('schools')
    .select(PUBLIC_SCHOOL_LIST_FIELDS, { count: 'exact' })
    .eq('is_publicly_listed', true)
    .eq('is_platform_active', true)

  if (filters.q && filters.q.trim().length >= 2) {
    // ilike on name/city/state: Postgres escapes the pattern value itself,
    // the wildcard characters below are ours, not passed through from the
    // caller's raw input.
    const term = filters.q.trim().replace(/[%_]/g, m => `\\${m}`)
    query = query.or(`name.ilike.%${term}%,city.ilike.%${term}%,state.ilike.%${term}%`)
  }
  if (filters.state) query = query.eq('state', filters.state)
  if (filters.schoolType) query = query.eq('school_type', filters.schoolType)
  if (filters.educationLevel) query = query.contains('education_levels', [filters.educationLevel])
  if (filters.boarding === 'boarding') query = query.eq('is_boarding', true)
  if (filters.boarding === 'day') query = query.eq('is_day', true)
  if (filters.verifiedOnly) query = query.eq('verified_status', 'verified')

  query = query
    .order('verified_status', { ascending: false }) // verified schools surface first
    .order('name', { ascending: true })
    .range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) throw error

  return { schools: (data ?? []) as unknown as PublicSchoolListItem[], total: count ?? 0 }
}

/** Single public school profile by slug (§45). Null if not found, not
 *  listed, or not active: callers should render a 404, not distinguish
 *  the reason (an unlisted school's existence shouldn't be confirmable by
 *  probing slugs). */
export async function getPublicSchoolBySlug(
  admin: SupabaseClient,
  slug: string
): Promise<PublicSchoolProfile | null> {
  const { data, error } = await admin
    .from('schools')
    .select(PUBLIC_SCHOOL_FIELDS)
    .eq('slug', slug)
    .eq('is_publicly_listed', true)
    .eq('is_platform_active', true)
    .maybeSingle()

  if (error) throw error
  return (data as unknown as PublicSchoolProfile) ?? null
}

/** Upcoming public events for a school profile: only rows explicitly
 *  marked is_public (see migration note on school_events). */
export async function getPublicSchoolEvents(admin: SupabaseClient, schoolId: string) {
  const { data, error } = await admin
    .from('school_events')
    .select('id, title, event_type, start_date, end_date, description, all_day')
    .eq('school_id', schoolId)
    .eq('is_public', true)
    .gte('start_date', new Date().toISOString().slice(0, 10))
    .order('start_date', { ascending: true })
    .limit(6)

  if (error) throw error
  return data ?? []
}

/** Real, non-fabricated platform stat for the landing page: just a count,
 *  never invented numbers. Callers should hide the stats section entirely
 *  if this comes back at 0 rather than show a hollow "0 schools". */
export async function getPublicPlatformStats(admin: SupabaseClient) {
  const { count: schoolCount } = await admin
    .from('schools')
    .select('id', { count: 'exact', head: true })
    .eq('is_platform_active', true)

  const { count: publicSchoolCount } = await admin
    .from('schools')
    .select('id', { count: 'exact', head: true })
    .eq('is_publicly_listed', true)
    .eq('is_platform_active', true)

  return {
    schoolsOnPlatform: schoolCount ?? 0,
    schoolsPubliclyListed: publicSchoolCount ?? 0,
  }
}
